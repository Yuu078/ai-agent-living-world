/**
 * GATE 2 end-to-end test (AGENTS.md Sections 6 & 8).
 *
 * Prerequisite: the Phase 2 server is RUNNING (coordinator starts it on a
 * fresh DB). This script:
 *   1. GET /health                       -> expects phase 2
 *   2. POST /api/telemetry, wrong token  -> expects 401
 *   3. POST /api/telemetry, bad payload  -> expects 400
 *   4. Connects a Socket.IO test client
 *   5. POSTs the exact Section 8 example -> expects HTTP 200 { ok: true }
 *   6. Asserts the socket client receives `agent:state_change` with the
 *      payload intact (thoughtBubble exactly "Auditing smart contract...")
 *   7. Asserts the event is persisted in SQLite (task_events) and the
 *      agent row status updated.
 *
 * The telemetry secret is read from server/.env and never printed.
 * Run: node scripts/test-gate2.mjs   (from repo root)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'server');
const clientRequire = createRequire(resolve(root, 'client/package.json'));
const serverRequire = createRequire(resolve(serverDir, 'package.json'));
const { io } = clientRequire('socket.io-client');
const Database = serverRequire('better-sqlite3');

/* --- read server/.env without printing secrets --------------------------- */
const env = {};
for (const line of readFileSync(resolve(serverDir, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const PORT = Number(env.PORT ?? 4000);
const SECRET = env.TELEMETRY_SECRET;
const DB_PATH = resolve(serverDir, env.DATABASE_PATH ?? './data/living-world.db');
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const post = (body, token) =>
  fetch(`${BASE}/api/telemetry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

/* --- 1. health ------------------------------------------------------------ */
const health = await (await fetch(`${BASE}/health`)).json();
check('GET /health reports phase 2', health.status === 'ok' && health.phase === 2, JSON.stringify(health));

/* --- 2. wrong token -> 401 ------------------------------------------------- */
const wrong = await post({ agentId: 'agent-programmer-1', state: 'typing', targetZone: 'desk' }, 'definitely-wrong');
check('POST /api/telemetry with wrong token -> 401', wrong.status === 401, `status=${wrong.status}`);

/* --- 3. invalid payload -> 400 ---------------------------------------------- */
const bad = await post({ agentId: 'agent-programmer-1', state: 'flying', targetZone: 'desk' }, SECRET);
check('POST /api/telemetry with invalid state -> 400', bad.status === 400, `status=${bad.status}`);
const unknown = await post({ agentId: 'agent-does-not-exist', state: 'typing', targetZone: 'desk' }, SECRET);
check('POST /api/telemetry with unknown agentId -> 400', unknown.status === 400, `status=${unknown.status}`);

/* --- 4+5+6. socket client + Section 8 example ------------------------------ */
const socket = io(BASE, { transports: ['websocket', 'polling'] });
const broadcastPromise = new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('no broadcast within 4s')), 4000);
  socket.on('agent:state_change', (payload) => {
    clearTimeout(timer);
    res(payload);
  });
});
await new Promise((res, rej) => {
  socket.on('connect', res);
  socket.on('connect_error', rej);
});
check('Socket.IO test client connected', socket.connected);

const example = {
  agentId: 'agent-programmer-1',
  source: 'external_webhook',
  state: 'typing',
  targetZone: 'desk',
  thoughtBubble: 'Auditing smart contract...',
};
const resp = await post(example, SECRET);
const respJson = await resp.json().catch(() => ({}));
check('POST Section 8 example -> HTTP 200 ok:true', resp.status === 200 && respJson.ok === true, `status=${resp.status}`);

let payload = null;
try {
  payload = await broadcastPromise;
} catch (e) {
  check('broadcast received', false, e.message);
}
if (payload) {
  check('broadcast event name payload agentId matches', payload.agentId === 'agent-programmer-1');
  check('broadcast state is typing', payload.state === 'typing');
  check('broadcast targetZone is desk', payload.targetZone === 'desk');
  check(
    'broadcast thoughtBubble is EXACT',
    payload.thoughtBubble === 'Auditing smart contract...',
    JSON.stringify(payload.thoughtBubble),
  );
  check('broadcast source is external_webhook', payload.source === 'external_webhook');
  check('broadcast timestamp is a number', typeof payload.timestamp === 'number');
}
socket.close();

/* --- 7. persistence --------------------------------------------------------- */
const db = new Database(DB_PATH, { readonly: true });
const row = db
  .prepare(
    "SELECT task_id, agent_id, event_type, payload_json FROM task_events WHERE agent_id = ? AND event_type = 'agent:state_change' ORDER BY id DESC LIMIT 1",
  )
  .get('agent-programmer-1');
check('event persisted in task_events', !!row);
if (row) {
  const saved = JSON.parse(row.payload_json);
  check(
    'persisted payload keeps exact thoughtBubble',
    saved.thoughtBubble === 'Auditing smart contract...' && saved.state === 'typing',
  );
}
const agent = db.prepare('SELECT status FROM agents WHERE id = ?').get('agent-programmer-1');
check('agents.status updated to typing', agent?.status === 'typing', `status=${agent?.status}`);
const agentCount = db.prepare('SELECT COUNT(*) AS n FROM agents').get().n;
check('seed contains exactly 6 agents', agentCount === 6, `count=${agentCount}`);
db.close();

console.log(failures === 0 ? '\nGATE 2 E2E: ALL CHECKS PASSED' : `\nGATE 2 E2E: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
