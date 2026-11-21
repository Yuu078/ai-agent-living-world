# TEST REPORT — Phase 2: Backend, Persistence & Telemetry Bridge

Project: AI Agent Living World 3D (`~/workspace/ai-agent-living-world`)
Spec: `AGENTS.md` Sections 4 (DB schema), 5 (event contract), 6 (Phase 2 + Gate 2), 7 (env), 8 (curl examples).
Date: 2026-11-21. Verifier: Phase 2 coordinator agent (integration + gates run locally, in order, against the final code state).

## What was built

### Server (`server/`, Fastify + TypeScript, port 4000)
- SQLite via better-sqlite3 + Drizzle ORM. Tables created on boot (idempotent
  DDL): `agents`, `tasks`, `task_events`, `artifacts`, `world_objects`,
  `meetings` — exactly the Section 4 schema.
- Idempotent seed on boot: the same 6 agents as the Phase 1 client, with the
  SAME ids (`agent-manager-1` Nova, `agent-programmer-1` Kai,
  `agent-programmer-2` Rin, `agent-designer-1` Mika, `agent-researcher-1`
  Sora, `agent-qa-1` Bimo), desk positions from the Phase 1 layout, plus 10
  default `world_objects`. Re-running the seed inserts 0 duplicates.
- REST API (JSON errors shaped `{ error: { code, message } }`):
  - `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id`
  - `GET/POST /api/tasks`, `GET /api/tasks/:id`,
    `POST /api/tasks/:id/assign`, `POST /api/tasks/:id/cancel` (→ status
    `failed`, errorLog "Cancelled by operator"),
    `POST /api/tasks/:id/retry` (only from `failed`; otherwise 409)
  - `GET/POST /api/artifacts`, `GET /api/artifacts/:id`
  - `GET/POST /api/world` (load / batch-upsert `world_objects`)
  - `GET /health` → `{ status: "ok", service, phase: 2, timestamp }`
- `POST /api/telemetry` — Bearer `TELEMETRY_SECRET` auth (from `server/.env`,
  created from `.env.example` with local dev values; `.env` is gitignored and
  its values are never printed here). Payload validated against the Section 5
  contract: invalid body → 400, unknown `agentId` → 400, wrong/missing token
  → 401. On success: the event is recorded in `task_events`, the agent row's
  status/token totals are updated, the payload is broadcast via Socket.IO as
  `agent:state_change` (payload exactly per Section 5), response
  `200 { ok: true }`.
- Dependency note: `better-sqlite3` was bumped `^11` → `^12.4.1` in
  `server/package.json` because the v11 native build could not compile in
  this environment (header download failed under node-gyp); v12 ships a
  working prebuild for Node 24. No global installs were made.

### Client (`client/`)
- `src/net/socketBridge.ts` — Socket.IO client singleton connecting to
  `VITE_SERVER_URL` (default `http://localhost:4000`); on
  `agent:state_change` it calls `useWorldStore.applyExternalEvent(...)`; on
  connect/disconnect it sets `serverConnected`.
- `simulation.applyExternalEvent` implements the Section 5 Visual Mapping Law:
  `walking` → A* path to `targetZone`; `typing`/`tool_calling` → sit at own
  desk + thought bubble; `meeting` → walk to meeting room; `celebrating`,
  `error`, `coffee_break`, `idle` mapped per spec. While an external event
  controls an agent, the ambient life simulation does not override it; the
  next `idle` event releases control.
- TopBar mode chip is honest: green **LIVE_MODE** ("Server connected —
  telemetry bridge live") when the socket is connected, amber **DEMO_MODE**
  ("Local simulation — server offline") otherwise.

### Visual fixes (owner priority — see "Visual verification" below)
1. **Cutaway default ON**: `useWorldStore` now defaults `cutaway: true`, and
   choosing the Isometric or Top camera preset forces cutaway on (Orbit /
   Follow unchanged). The roof/walls no longer hide the interior on first
   load.
2. **Root-cause bug found & fixed (Phase 1 defect)**: the "roof covers
   everything" symptom was NOT the roof. In
   `client/src/scene/CampusEnvironment.tsx` the outer ground apron used
   `<planeGeometry args={[160, 160]} />` **without the rotation that lays a
   plane flat**. PlaneGeometry faces +Z, so the apron stood upright as a
   160×160 vertical green wall at world z = 0 — slicing the office between
   the two desk rows. From the isometric camera it hid Nova/Kai/Rin (labels
   floated over dark green); the meeting room was hidden too. Diagnosed by
   component bisect (hiding CampusEnvironment removed the artifact; shadows
   on/off made no difference). Fix: `rotation={[-Math.PI / 2, 0, 0]}` on the
   apron mesh, with an explanatory comment. All diagnostic detours taken
   during the hunt (shadow-camera widening, roof castShadow removal, debug
   component toggles) were fully reverted — the only scene changes shipped
   are the apron rotation and the cutaway default.

## Gate 2 results

| # | Gate item | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Typecheck, all workspaces | ✅ PASS | `npm run typecheck` — shared, client, server: 0 errors |
| 2 | Build, all workspaces | ✅ PASS | `npm run build` — 0 errors (one pre-existing >500 kB chunk-size warning, same as Phase 1) |
| 3 | Server boots from clean DB; migration + seed run; `/health` OK | ✅ PASS | Fresh `server/data/living-world.db` deleted → boot → `GET /health` → `{"status":"ok","service":"ai-agent-living-world-server","phase":2,...}`; seed check inside Gate 2 script: exactly 6 agents |
| 4 | Gate 2 E2E (Section 8 example) — `npm run test:gate2` | ✅ PASS — 16/16 | Full output below |
| 4a | → HTTP response success | ✅ PASS | `POST /api/telemetry` (Kai, typing, desk, "Auditing smart contract...") → `200 { ok: true }` |
| 4b | → Socket.IO test client receives broadcast with payload intact | ✅ PASS | `agent:state_change` received; agentId, state `typing`, targetZone `desk`, source `external_webhook`, numeric timestamp, and thoughtBubble **exactly** `"Auditing smart contract..."` |
| 4c | → Event persisted in DB | ✅ PASS | Row in `task_events` with payload_json keeping the exact thoughtBubble; `agents.status` for Kai updated to `typing` |
| 4d | → Wrong token rejected | ✅ PASS | `POST /api/telemetry` with wrong Bearer → 401 |
| 4e | → Invalid payload / unknown agent rejected | ✅ PASS | state `flying` → 400; unknown agentId → 400 |
| 5 | Client mapping logic test — `npm run test:telemetry-client` | ✅ PASS — 13/13 | The Section 8 event applied to the client store yields Kai: state `typing`, zone `desk`, bubble text exact, desk-bound movement intent; externally controlled agent not stolen by lifeSim ticks; `idle` releases control; server/agent mismatch rejected |
| 6 | Pathfinding regression (Phase 1 suite) | ✅ PASS | `npm run test:path` — ALL PATHFINDING CHECKS PASSED (183/183) |
| 7 | REST API smoke (manual curl) | ✅ PASS | agents list; task create → assign → cancel (status `failed`) → retry (status `queued`) → retry again → 409; artifact create + list by task; `GET /api/world` returns 10 seeded objects; `POST /api/world` upsert → `{saved: 1}`; unknown agent → 404; task with unknown agent → 400 |
| 8 | Visual: default view shows interior + all 6 avatars | ✅ PASS | `screenshots/phase2-default-view.png` — roof hidden (cutaway default), meeting room, coffee counter, reception, lounge visible; avatar bodies at all 6 desks |
| 9 | Visual: top view sanity | ✅ PASS | `screenshots/phase2-top-view.png` — both desk rows, all 6 agents, no occluding band |
| 10 | Visual: Gate 2 telemetry proof in the real UI | ✅ PASS | `screenshots/phase2-telemetry-bubble.png` — after the Section 8 POST, Kai sits at his desk with the thought bubble **"Auditing smart contract..."** rendered above him; TopBar shows LIVE_MODE |

### Gate 2 E2E output (`npm run test:gate2`, final code, fresh DB)

```
PASS  GET /health reports phase 2
PASS  POST /api/telemetry with wrong token -> 401 — status=401
PASS  POST /api/telemetry with invalid state -> 400 — status=400
PASS  POST /api/telemetry with unknown agentId -> 400 — status=400
PASS  Socket.IO test client connected
PASS  POST Section 8 example -> HTTP 200 ok:true — status=200
PASS  broadcast event name payload agentId matches
PASS  broadcast state is typing
PASS  broadcast targetZone is desk
PASS  broadcast thoughtBubble is EXACT — "Auditing smart contract..."
PASS  broadcast source is external_webhook
PASS  broadcast timestamp is a number
PASS  event persisted in task_events
PASS  persisted payload keeps exact thoughtBubble
PASS  agents.status updated to typing — status=typing
PASS  seed contains exactly 6 agents — count=6
GATE 2 E2E: ALL CHECKS PASSED
```

Note on the test script: `scripts/test-gate2.mjs` tests against an already
running server (it reads the port/secret/DB path from `server/.env` and
never prints the secret). Start the server first (below), then run it.

## How to run

```bash
# from repo root — install once
npm install

# terminal 1: server (auto-creates + seeds server/data/living-world.db)
npm run dev:server        # or: npm run build && node server/dist/index.js

# terminal 2: client
npm run dev:client        # Vite dev server
# production preview of the built client:
cd client && npx vite preview --port 4173 --host 0.0.0.0

# gates
npm run test:gate2              # server must be running
npm run test:telemetry-client   # client store logic
npm run test:path               # Phase 1 pathfinding regression
```

## Screenshots

- `screenshots/phase2-default-view.png` — default isometric view after fixes:
  interior + all 6 avatars visible, TopBar LIVE_MODE.
- `screenshots/phase2-telemetry-bubble.png` — same view moments after the
  Section 8 telemetry POST: "Auditing smart contract..." bubble over Kai at
  his desk.
- `screenshots/phase2-top-view.png` — top-down preset (cutaway on): full
  office readable, no occlusion.
- `screenshots/phase2-follow-kai.png` — diagnostic shot taken DURING the bug
  hunt (pre-fix): shows the pre-fix symptom (Kai's label floating over the
  dark apron wall). Kept as evidence of the defect that was fixed.

Screenshots were captured with Playwright Chromium using SwiftShader
(`--use-gl=swiftshader --enable-unsafe-swiftshader --no-sandbox`) against
`vite preview` on port 4173 with the server running on port 4000.

## Known leftovers / notes

- The client bundle still triggers Vite's >500 kB chunk-size warning
  (pre-existing since Phase 1; not a Gate 2 failure).
- The Sidebar "Logs — Phase 2" entry remains a locked placeholder in the UI;
  Phase 2's scope was the telemetry pipeline itself (delivered), and no spec
  section asks for a logs panel in this phase.
- `server/.env` contains local dev values only and is gitignored; rotate
  `TELEMETRY_SECRET` before any non-local deployment.
- Phase 3/4 were not touched.
