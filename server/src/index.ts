/**
 * AI Agent Living World — server entrypoint.
 *
 * PHASE 2: SQLite/Drizzle persistence (auto-migrate + seed on boot),
 * REST API (/api/agents, /api/tasks, /api/artifacts, /api/world),
 * Socket.IO broadcast, and the POST /api/telemetry external bridge.
 * PHASE 3: live LLM orchestrator (POST /api/run, /api/chat,
 * /api/meetings, approval gate, /api/stats) — see engine/orchestrator.ts.
 * PHASE 4: build mode + Floor 2 (executive & lab), world-objects
 * broadcast, think-tag stripping on all artifact write paths.
 * All LLM keys and tool execution live here in server/ — never in
 * the frontend (Hard Rule 4).
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { initOrchestrator } from './engine/orchestrator.js';
import { initRealtime } from './realtime.js';
import agentsRoutes from './routes/agents.js';
import artifactsRoutes from './routes/artifacts.js';
import orchestratorRoutes from './routes/orchestrator.js';
import tasksRoutes from './routes/tasks.js';
import telemetryRoutes from './routes/telemetry.js';
import worldRoutes from './routes/world.js';

const app = Fastify({ logger: true });

// The client is served from a different origin (Vite dev/preview on
// :5173) than the API (:4000). Socket.IO has always sent its own CORS
// headers, but plain REST fetches from the browser were blocked until
// this plugin was registered (found in Phase 3 visual verification:
// TopBar stats stayed at 0 in the real UI while curl worked fine).
await app.register(cors, { origin: '*' });

app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-agent-living-world-server',
  phase: 4,
  timestamp: Date.now(),
}));

await app.register(agentsRoutes);
await app.register(tasksRoutes);
await app.register(artifactsRoutes);
await app.register(worldRoutes);
await app.register(telemetryRoutes);
await app.register(orchestratorRoutes);

try {
  initDb();
  initOrchestrator();
  initRealtime(app.server);
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
