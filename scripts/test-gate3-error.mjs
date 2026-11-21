/**
 * GATE 3 error-handling test (AGENTS.md Section 6, Phase 3).
 *
 * Spawns a THROWAWAY server instance on port 4101 with a bogus model
 * id supplied ONLY via process env (LLM_DEFAULT_MODEL) and a temp DB.
 * The real server/.env is never touched: dotenv does not override
 * variables already present in the process environment.
 *
 * Proves the NO FAKE WORK contract under failure:
 *   - a goal whose LLM calls fail ends `failed` with an honest
 *     error_log (no fabricated output, no artifact),
 *   - the responsible avatar is driven to the `error` state
 *     (broadcast over Socket.IO and mirrored in the agents table),
 *   - Retry re-executes the goal (and fails again, honestly, while
 *     the model id stays bogus).
 *
 * Run: node scripts/test-gate3-error.mjs   (from repo root)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'server');
const clientRequire = createRequire(resolve(root, 'client/package.json'));
const { io } = clientRequire('socket.io-client');

const PORT = 4101;
const BASE = `http://localhost:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), 'lw-gate3-error-'));
const dbPath = join(tmp, 'error-test.db');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(process.execPath, [resolve(serverDir, 'dist/index.js')], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_PATH: dbPath,
    LLM_DEFAULT_MODEL: 'bogus/model-does-not-exist-123',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (d) => (serverLog += d));
child.stderr.on('data', (d) => (serverLog += d));

async function req(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
const post = (path, body) => req(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const get = (path) => req(path);

async function waitForTask(id, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let task = null;
  while (Date.now() < deadline) {
    task = (await get(`/api/tasks/${id}`)).body;
    if (task.status === 'completed' || task.status === 'failed') return task;
    await sleep(2500);
  }
  return task;
}

try {
  // Wait for the throwaway server to boot.
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      const h = await get('/health');
      up = h.body?.status === 'ok';
    } catch {
      await sleep(500);
    }
  }
  check('throwaway server booted on 4101 with bogus model env', up);
  if (!up) throw new Error(`server did not boot. Log tail: ${serverLog.slice(-500)}`);

  // Capture broadcasts to prove the error state reaches the 3D world.
  const events = [];
  const socket = io(BASE, { transports: ['websocket', 'polling'] });
  await new Promise((res) => socket.on('connect', res));
  socket.on('agent:state_change', (e) => events.push(e));

  const run = await post('/api/run', { prompt: 'Write a one-sentence greeting for the team.' });
  check('goal accepted by throwaway server', run.status === 201, `status=${run.status}`);
  const taskId = run.body.id;

  const final1 = await waitForTask(taskId);
  check('goal with bogus model ends failed', final1?.status === 'failed', `status=${final1?.status}`);
  check(
    'error_log honestly reports the LLM failure',
    typeof final1?.errorLog === 'string' && /LLM request failed|bogus/i.test(final1.errorLog),
    (final1?.errorLog ?? '').slice(0, 140),
  );
  const artifacts = (await get(`/api/artifacts?taskId=${taskId}`)).body;
  check('no artifact fabricated for the failed goal', artifacts.length === 0, `artifacts=${artifacts.length}`);

  await sleep(600);
  const errorEvents = events.filter((e) => e.state === 'error' && e.source === 'internal');
  check('avatar error state broadcast (source=internal)', errorEvents.length >= 1, `count=${errorEvents.length}`);
  const agents = (await get('/api/agents')).body;
  check(
    'an agent row mirrors the error status',
    agents.some((a) => a.status === 'error'),
    agents.map((a) => `${a.id}:${a.status}`).join(' '),
  );

  // Retry must re-execute (and, with the model still bogus, fail again).
  const retry = await post(`/api/tasks/${taskId}/retry`);
  check('retry accepted from failed', retry.status === 200 && retry.body.status === 'queued', `status=${retry.body?.status}`);
  const final2 = await waitForTask(taskId);
  check('retried goal executes again and fails honestly', final2?.status === 'failed' && !!final2?.errorLog, `status=${final2?.status}`);

  socket.disconnect();
} finally {
  child.kill('SIGTERM');
  await sleep(500);
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}

console.log(failures === 0 ? '\nGATE 3 ERROR TEST: ALL CHECKS PASSED' : `\nGATE 3 ERROR TEST: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
