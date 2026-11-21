# AI Agent Living World 3D

Kantor virtual 3D tempat agen AI terlihat bekerja: avatar berjalan dengan pathfinding A*, duduk mengetik, meeting, istirahat kopi — digerakkan event real-time (Socket.IO) dan jembatan telemetri HTTP.

## Jalanin di lokal (Windows)

Prasyarat: Node.js 22+ (`node -v`).

```bat
git clone https://github.com/Yuu078/ai-agent-living-world.git
cd ai-agent-living-world
npm install
copy server\.env.example server\.env
```

Terminal 1 (server, port 4000):

```bat
npm run dev -w server
```

Terminal 2 (client):

```bat
npm run dev
```

Buka http://localhost:5173 — tanpa server, client jalan di DEMO_MODE; dengan server, LIVE_MODE.

## Struktur

- `client/` — Vite + React 19 + three.js (R3F/drei) + zustand
- `server/` — Fastify + Socket.IO + SQLite (Drizzle)
- `shared/` — kontrak tipe & event bersama

Spek lengkap: `MASTER-SPEC.md`. Laporan gate: `TEST_REPORT-PHASE1.md`, `TEST_REPORT-PHASE2.md`.
