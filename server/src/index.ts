/**
 * AI Agent Living World — server entrypoint.
 *
 * PHASE 2: SQLite/Drizzle persistence (auto-migrate + seed on boot),
 * REST API (/api/agents, /api/tasks, /api/artifacts, /api/world),
 * Socket.IO broadcast, and the POST /api/telemetry external bridge
 * (see AGENTS.md Sections 4–6). The LLM orchestrator is Phase 3.
 * All LLM keys and tool execution live here in server/ — never in
 * the frontend (Hard Rule 4).
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { initRealtime } from './realtime.js';
import agentsRoutes from './routes/agents.js';
import artifactsRoutes from './routes/artifacts.js';
import tasksRoutes from './routes/tasks.js';
import telemetryRoutes from './routes/telemetry.js';
import worldRoutes from './routes/world.js';

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-agent-living-world-server',
  phase: 2,
  timestamp: Date.now(),
}));

await app.register(agentsRoutes);
await app.register(tasksRoutes);
await app.register(artifactsRoutes);
await app.register(worldRoutes);
await app.register(telemetryRoutes);

try {
  initDb();
  initRealtime(app.server);
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
