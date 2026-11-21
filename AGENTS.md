# AGENTS.md — AI Agent Living World 3D (Production-Ready Spec)

## 1. MISSION & HARD RULES
Build **AI Agent Living World**, a real, runnable 3D interactive virtual office & live AI agent command center (styled like *Two Point Campus* / *The Sims*).

**NON-NEGOTIABLE ENGINEERING RULES:**
1. **NO FAKE WORK:** Never mock LLM responses in Live Mode. Separate `DEMO_MODE` (explicitly labeled) from `LIVE_MODE` (real API calls + real DB persistence).
2. **NO UGLY PRIMITIVE BOXES:** Use rounded/beveled procedural geometry (`RoundedBox` from `@react-three/drei`), PBR materials (`roughness`, `metalness`, `transmission` for glass), warm studio/sun lighting, and soft shadows.
3. **ZERO-CLIPPING MOVEMENT:** All avatars MUST navigate via the 2D Grid A* Pathfinding engine. Walking through walls or desks is a critical bug.
4. **ZERO SECRETS IN FRONTEND:** All LLM API keys and tool executions live strictly in `server/`.
5. **GATE-DRIVEN DELIVERY:** Complete one Phase at a time. Do NOT start Phase N+1 until all Verification Gates in Phase N pass cleanly (`tsc --noEmit`, `npm run build`, runtime check).

---

## 2. TECH STACK (ZERO-COST, LOCAL & VPS READY)
Monorepo structure:
- `client/` — Vite + React 19 + TypeScript + Tailwind CSS + Three.js + `@react-three/fiber` + `@react-three/drei` + `zustand` + `socket.io-client` + `lucide-react`
- `server/` — Node.js + TypeScript + Fastify (or Express) + `socket.io` + SQLite (`better-sqlite3`) + Drizzle ORM + `openai` SDK (configured with custom `baseURL` for universal router/provider support)
- `shared/` — Shared TypeScript types (`AgentState`, `WorldEvent`, `TaskPayload`, `GridMap`)

---

## 3. FOLDER ARCHITECTURE
```text
ai-agent-living-world/
├── AGENTS.md                   # This specification file
├── shared/
│   └── types.ts                # Shared DTOs, WebSocket events, Agent states
├── server/
│   ├── src/
│   │   ├── index.ts            # HTTP + Socket.IO entrypoint
│   │   ├── db/
│   │   │   ├── schema.ts       # Drizzle SQLite schema (6 core tables)
│   │   │   └── index.ts        # Auto-migrate + seed default office & 6 agents
│   │   ├── engine/
│   │   │   ├── llmAdapter.ts   # Universal OpenAI-compatible client (supports custom BASE_URL)
│   │   │   ├── orchestrator.ts # Task queue, subtask handoff, retry, cost/token tracker
│   │   │   └── tools.ts        # Safe sandboxed tools (web_fetch, write_artifact, run_summary)
│   │   └── routes/
│   │       ├── agents.ts       # CRUD agents
│   │       ├── tasks.ts        # Create, assign, cancel, retry tasks
│   │       ├── telemetry.ts    # POST /api/telemetry (External Agent Bridge)
│   │       └── world.ts        # Save/load furniture & room layout
│   └── .env.example
└── client/
    └── src/
        ├── store/useWorldStore.ts     # Zustand synced with Socket.IO
        ├── engine/
        │   ├── pathfinding.ts         # 2D Grid A* + obstacle grid map
        │   └── lifeSim.ts             # Separate idle/break/coffee/lounge scheduler
        ├── scene/
        │   ├── WorldCanvas.tsx        # R3F Canvas, Lighting, Shadows, CameraRig
        │   ├── CampusEnvironment.tsx  # Ground, trees (InstancedMesh), pathways, fountain
        │   ├── OfficeBuilding.tsx     # Modular floor, glass walls, rooms, hide-wall/roof cutaway
        │   ├── Furniture.tsx          # Desks, monitors (live glow state), meeting table, coffee bar
        │   └── AgentAvatar.tsx        # Articulated stylized 3D character + state animations + floating badge
        └── ui/
            ├── TopBar.tsx             # Live/Demo toggle, world clock, active agents, API cost
            ├── Sidebar.tsx            # World, Agents, Tasks, Meetings, Build Mode, Logs
            ├── InspectorPanel.tsx     # Right context panel: live chat, tool logs, artifacts
            └── BottomDock.tsx         # Camera presets (Isometric/Orbit/Follow/Top), speed 1x/2x/4x
```

---

## 4. DATABASE SCHEMA (SQLITE + DRIZZLE — 6 CORE TABLES)
1. `agents`: `id, name, role, department, model, system_prompt, avatar_config_json, desk_pos_json, status, total_tokens, total_cost_usd`
2. `tasks`: `id, title, prompt, assigned_agent_id, parent_task_id, status (queued|running|waiting_approval|completed|failed), priority, result_artifact_id, error_log, created_at`
3. `task_events`: `id, task_id, agent_id, event_type, payload_json, created_at`
4. `artifacts`: `id, task_id, agent_id, filename, mime_type, content_text, created_at`
5. `world_objects`: `id, type, room, pos_x, pos_y, pos_z, rot_y, metadata_json`
6. `meetings`: `id, topic, participant_ids_json, transcript_json, action_items_json, status`

---

## 5. REAL-TIME EVENT CONTRACT (BACKEND + EXTERNAL BRIDGE -> 3D)
Both the internal orchestrator AND external agents (`POST /api/telemetry`) emit this exact payload over Socket.IO (`agent:state_change`):

```json
{
  "agentId": "agent-programmer-1",
  "source": "internal | external_webhook",
  "state": "idle | walking | thinking | typing | tool_calling | meeting | celebrating | error | coffee_break",
  "targetZone": "desk | meeting_room | coffee_bar | lounge",
  "thoughtBubble": "Running TypeScript build check...",
  "taskId": "task_123",
  "tokensUsed": 450,
  "costUsd": 0.0012,
  "timestamp": 1763700000000
}
```

**Visual Mapping Law:**
- `walking` -> Trigger A* path to `targetZone`, play walk leg/arm swing cycle.
- `typing` / `tool_calling` -> Sit at desk, face monitor, monitor screen glows cyan/green, typing arm animation, show live `thoughtBubble`.
- `meeting` -> Walk to Meeting Room seats, face center table, speaker plays talking gesture.
- `celebrating` -> Jump/wave animation + green toast notification + artifact link.
- `error` -> Red pulse indicator above avatar + clickable error log in InspectorPanel.
- `idle` (no active task) -> Hand off to `lifeSim.ts` (coffee break, lounge, walk around park) WITHOUT calling any LLM API.

---

## 6. EXECUTION ROADMAP & VERIFICATION GATES

### PHASE 1: CORE 3D LIVING OFFICE & PATHFINDING (BUILD FIRST)
- Setup monorepo (`client/`, `server/`, `shared/`) with TypeScript strict mode.
- Build stylized 1-floor HQ Campus (Reception, Open Workspace with 6 desks, Glass Meeting Room, Coffee Corner, Outdoor Garden with InstancedMesh trees & path).
- Implement Isometric 3/4 default camera, Free Orbit, Top-Down, Follow Agent, and smooth wall/roof cutaway toggle.
- Implement 6 articulated stylized 3D avatars with smooth A* grid pathfinding (zero wall/desk clipping) and state animations (`idle`, `walking`, `sitting`, `typing`, `thinking`, `coffee_break`).
- Build glassmorphism desktop UI (TopBar, Sidebar, Right InspectorPanel, BottomDock).
- **GATE 1:** `npm run typecheck && npm run build` passes with 0 errors. All 6 avatars navigate between desks, meeting room, and coffee bar without clipping.

### PHASE 2: REAL BACKEND, SQLITE PERSISTENCE & EXTERNAL TELEMETRY BRIDGE
- Implement SQLite + Drizzle auto-migration and seed script.
- Implement REST API (`/api/agents`, `/api/tasks`, `/api/artifacts`, `/api/world`) and Socket.IO broadcast.
- Implement `POST /api/telemetry` with optional Bearer token so external agents/scripts can drive avatars live.
- Connect `useWorldStore` in `client/` to Socket.IO.
- **GATE 2:** Sending a `curl -X POST http://localhost:4000/api/telemetry` immediately moves the target 3D avatar to its desk, changes its animation to `typing`, and displays the exact `thoughtBubble` in real time.

### PHASE 3: LIVE LLM AGENT ORCHESTRATOR & MULTI-AGENT COLLABORATION
- Implement `llmAdapter.ts` supporting any OpenAI-compatible API (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_DEFAULT_MODEL`).
- Implement real Task Orchestration: Manager Agent breaks down a user prompt into subtasks -> assigns to Research / Programmer / Designer / QA Agents -> saves real Markdown/Code artifacts to `artifacts` table -> streams every step to 3D avatars.
- Implement Live Chat with any clicked avatar + Real Meeting Room (multi-agent turn-based discussion producing real meeting minutes & action items).
- Add Human Approval gate for risky actions + Token & USD cost tracking.
- **GATE 3:** Running a live task creates real DB records, triggers real sequential avatar movements & animations, generates downloadable artifacts, and cleanly handles API errors/timeouts with Retry/Cancel.

### PHASE 4: BUILD MODE, MULTI-FLOOR EXPANSION & PERFORMANCE
- Add Build Mode: grid-snapped furniture placement, rotate, delete, collision check, auto-rebuild A* obstacle grid, persist to `world_objects` table.
- Add Floor 2 (Executive & R&D Lab) with floor switcher + elevator transition.
- Add Performance Quality presets (`Low / Medium / High / Auto`) with adaptive DPR and InstancedMesh batching for 20-50+ agents.
- **GATE 4:** Placing a new desk persists across page reload and automatically updates A* pathfinding obstacles. Produce an honest `TEST_REPORT.md` marking every feature PASS / FAIL / NOT TESTED.

---

## 7. ENVIRONMENT SETUP (`server/.env`)
```env
PORT=4000
DATABASE_PATH=./data/living-world.db

# Universal OpenAI-compatible (Local Router, OpenRouter, Gemini OpenAI endpoint, or OpenAI)
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-your-api-key-here
LLM_DEFAULT_MODEL=google/gemini-2.5-flash

TELEMETRY_SECRET=dev-secret-123
```

---

## 8. EXTERNAL TELEMETRY QUICK TEST
Once Phase 2 is running, any external agent or CLI script can control an avatar live via HTTP:

```bash
curl -X POST http://localhost:4000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-secret-123" \
  -d '{
    "agentId": "agent-programmer-1",
    "source": "external_webhook",
    "state": "typing",
    "targetZone": "desk",
    "thoughtBubble": "Auditing smart contract..."
  }'
```

---

## 9. PROMPTING PROTOCOL FOR CODING AGENT
Do NOT ask the agent to build all phases at once. Run strictly phase by phase:
> *"Read `AGENTS.md`. Initialize the monorepo and execute **PHASE 1** only. Run `npm run typecheck && npm run build` and verify **GATE 1** passes completely before reporting back."*