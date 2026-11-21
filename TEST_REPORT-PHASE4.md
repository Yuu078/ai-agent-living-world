# TEST REPORT — Phase 4 (Build Mode, Floor 2, Performance)

Date: 2026-11-21 · Server `/health` reports `phase: 4` · LLM unchanged
(MiniMaxAI/MiniMax-M2.7 via Dahl, key only in `server/.env`).

## Gate 4 verdict: PASS (with one honest caveat on Gate 3, see Regression)

The Gate 4 acceptance proof — *place a desk → it persists across a page
reload → the A\* obstacle grid changes and agents detour around it* — is
covered by two automated suites plus screenshots:

| Suite | Result |
|---|---|
| `npm run test:gate4-grid` (grid level, `scripts/test-gate4.ts`) | **21/21 PASS** |
| `npm run test:gate4` (API level, `scripts/test-gate4.mjs`) | **10/10 PASS** |
| Screenshots (`scripts/screenshot-phase4.py`) | 4/4 saved & visually verified |

Grid-level proof highlights: baseline corridor path (7,16)→(28,16) runs
straight through (16,16); after applying a placed desk footprint
(16,16)–(17,16) the path still exists, `isPathLegal` holds (zero
clipping), it avoids both footprint cells, and it is strictly longer
(detour). The base grid is not mutated. Placement validation rejects:
occupied cells, the elevator entry, the Floor 2 doorway, an agent's
cell, and a whiteboard placement that would wall off the executive
office (`reason: disconnects`, flood-fill reachability guard).

API-level proof highlights: POST `/api/world` with a user-placed desk →
fresh GET returns it (persistence) → row exists in SQLite → a second
POST triggers a `world:objects_changed` socket broadcast containing the
new object → DELETE restores the world to seeds only.

Persistence-across-reload is additionally proven visually: the
screenshot script places the corridor desk via REST *before* opening
the page; the desk is rendered on fresh load and listed in the Build
panel as `Desk (16, 16)` (`screenshots/phase4-desk-placed.png`,
`screenshots/phase4-buildmode.png`).

## Feature status

### 1. Build Mode — PASS
- Palette of 6 furniture kinds (desk 2×1, table 2×2, plant 1×1,
  bookshelf 2×1, sofa 3×1, whiteboard 2×1), snap-to-grid ghost preview
  driven by the *real* `checkPlacement` against the live A* grid
  (green = placeable, red = blocked with a human-readable reason).
- Rotate (button / `R`), move (select + click new spot), delete
  (button / `Del`), `Esc` cancels. Only `metadata.userPlaced` objects
  are editable; built-in furniture is locked.
- Every mutation goes through REST (`POST/DELETE /api/world`, bulk
  upsert contract `{objects:[…]}`) → server broadcasts
  `world:objects_changed` → all clients rebuild their grids via
  `simulation.setDynamicObjects`, and walking agents replan
  immediately (an agent whose destination becomes unreachable stops at
  its next waypoint instead of clipping).
- Caveat: the automated proof places via REST (the exact endpoint the
  UI uses) and verifies the UI lists/renders it; a synthetic mouse
  click on the 3D canvas itself was not machine-driven (Playwright
  click waits hang on this WebGL page; UI buttons were driven via DOM
  clicks in the screenshot script).

### 2. Floor 2 — Executive & R&D Lab — PASS
- Floor switcher (Sidebar + F1/F2 toggle in the Build panel); camera
  rig targets the active floor; Floor 1 roof hides while viewing
  Floor 2; the Floor 2 roof respects the cutaway toggle.
- Per-floor A* grids built from the same layout system: elevator →
  lab seat and elevator → executive chair (through the glass-partition
  doorway) paths exist and are legal (grid tests).
- Elevator: agents route path → elevator entry (27,7) → 1.4 s ride
  (avatar Y interpolates; the shaft car follows) → path on the other
  floor. Life simulator sends agents upstairs (lab/executive goals);
  screenshots show an agent with the `F2` sidebar badge typing in the
  lab with the bubble “Running experiments in the R&D lab…”, and the
  Floor 2 interior (exec desk + sofa, glass partition, lab benches,
  shelf, elevator shaft) renders correctly
  (`screenshots/phase4-floor2.png`).
- 5 Floor 2 seed objects inserted idempotently by id
  (`world2-exec-desk`, `world2-exec-sofa`, `world2-lab-bench-1/2`,
  `world2-lab-shelf`); telemetry accepts the new `lab`/`executive`
  target zones.

### 3. Performance — PASS (implementation) / NOT TESTED (FPS benchmark)
- Quality presets Low/Medium/High/Auto in the BottomDock: DPR caps
  (1 / 1.5 / 2 / adaptive 0.85–1.75 via drei `PerformanceMonitor`),
  shadows off on Low, shadow map 1024/2048 by preset; live FPS meter
  (1 Hz) rendered in the dock.
- Batching: guest crowd of up to 24 agents rendered as **2
  InstancedMeshes** (capsule bodies + sphere heads) — toggle in the
  dock; screenshot shows 18 guests wandering both floors
  (`screenshots/phase4-crowd.png`, TopBar “Active 18/6”). Walkway
  tiles converted from ~46 individual meshes to one InstancedMesh.
- No formal FPS numbers are claimed: this VM renders via SwiftShader
  (software GL), which is not representative of real hardware.

### 4. Phase 3 clean-up: `<think>` leakage — PASS
- Root cause: stripping existed only in `llmAdapter.chatCompletion`;
  the artifact write paths (`tools.writeArtifact`, `POST /api/artifacts`)
  stored raw model output. The parent brief mentioned one contaminated
  artifact — a direct DB scan found **9 of 42** (goal-result artifacts
  inherit subtask text, so it propagated).
- Fix: `stripThinkTags` extracted & exported from `llmAdapter` and
  applied on **both** write paths; `scripts/clean-think-artifacts.mjs`
  cleaned the 9 stored artifacts (lengths e.g. 8722 → 2038 chars;
  **0 became empty**, nothing fabricated). `test:gate4` asserts the DB
  now contains **0** artifacts with `<think>`.

## Regression

| Check | Result |
|---|---|
| `npm run typecheck` (shared + server + client) | **PASS — 0 errors** |
| `npm run build` (all workspaces) | **PASS** (only the pre-existing >500 kB chunk-size warning) |
| `npm run test:path` | **PASS — 183/183** |
| `npm run test:gate2` | **PASS — all checks** |
| `npm run test:gate3-error` | **PASS — all checks** |
| `npm run test:gate3` | **PARTIAL — 17/29** (see below) |

Gate 3 detail (honest): all non-LLM checks passed (health, seeding,
goal → task tree, orchestrator subtasks, approval gate, cancel, retry).
The run then stalled in the **meeting** segment: after the full 600 s
poll the meeting was still `running` with 0 messages, and the dependent
chat/artifact assertions failed with it. This is the documented Dahl
free-tier weather from the Phase 3 report (latency swings from ~7 s to
>10 min, 429/503), **not** a Phase 4 code change — Phase 4 does not
touch the orchestrator/meeting/chat logic. Corroboration: a direct
`POST /api/chat` probe immediately after the run timed out at 120 s
with no response body at all, while earlier in the same run the token
total still rose (66.632 → 67.401), i.e. the provider answered slowly,
then stalled. Re-running Gate 3 when Dahl recovers is recommended;
nothing was “fixed” by editing the test to force it green.

One test edit was made, disclosed here: `scripts/test-gate3.mjs`'s
health assertion was loosened from `phase === 3` to `phase >= 3`
(the same precedent Phase 3 set for Gate 2's `>= 2`), because `/health`
now legitimately reports phase 4. No other assertion was touched.

## Screenshots
- `screenshots/phase4-desk-placed.png` — REST-placed corridor desk
  rendered after a fresh page load (persistence).
- `screenshots/phase4-buildmode.png` — Build panel, palette, placed
  list showing `Desk (16, 16)`, elevator shaft visible.
- `screenshots/phase4-floor2.png` — Floor 2 interior (Executive + Lab).
- `screenshots/phase4-crowd.png` — guest crowd (instanced) wandering.

## Files changed
- **shared**: `types.ts` (`TargetZone += lab|executive`, `FloorId`,
  `WorldObjectPayload`, `FurnitureType`, `QualityPreset`,
  `WORLD_OBJECTS_CHANGED_EVENT`).
- **server**: `engine/llmAdapter.ts` (exported `stripThinkTags`),
  `engine/tools.ts` + `routes/artifacts.ts` (strip on write),
  `index.ts` (health phase 4), `routes/telemetry.ts` (zones),
  `realtime.ts` + `routes/world.ts` (`world:objects_changed`
  broadcast), `db/index.ts` (Floor 2 seeds).
- **client**: `engine/worldLayout.ts` (floors, Floor 2 layout,
  furniture defs, `checkPlacement`, dynamic obstacles),
  `engine/lifeSim.ts` (goal floors + upstairs goals),
  `engine/simulation.ts` (per-floor grids, elevator journeys, dynamic
  replans, crowd), `engine/api.ts` (world endpoints, real bulk
  contract), `engine/socketBridge.ts` (world event),
  `store/useWorldStore.ts` (floor/build/quality/crowd/FPS state),
  `store/useDataStore.ts` (world objects + refresh),
  `store/useBuildStore.ts` (new), `scene/WorldCanvas.tsx`,
  `scene/Floor2.tsx` (new), `scene/PlacedFurniture.tsx` (new),
  `scene/PlacedObjects.tsx` (new), `scene/CrowdAvatars.tsx` (new),
  `scene/BuildOverlay.tsx` (new), `scene/OfficeBuilding.tsx` (roof
  gating), `scene/AgentAvatar.tsx` (floor height/ride/label gating),
  `scene/CampusEnvironment.tsx` (instanced path tiles),
  `ui/BuildPanel.tsx` (new), `ui/Sidebar.tsx`, `ui/BottomDock.tsx`,
  `ui/InspectorPanel.tsx` (zone labels), `App.tsx`.
- **scripts**: `test-gate4.ts` (new), `test-gate4.mjs` (new),
  `clean-think-artifacts.mjs` (new), `screenshot-phase4.py` (new),
  `test-gate3.mjs` (health `>= 3`, disclosed above); `package.json`
  (`test:gate4`, `test:gate4-grid`).

No GitHub push was made (parent verifies & pushes). Server (port 4000)
and client preview (port 4173) are left running the Phase 4 build.
