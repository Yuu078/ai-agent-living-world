/**
 * GATE 3 end-to-end test (AGENTS.md Section 6, Phase 3).
 *
 * Prerequisite: the Phase 3 server is RUNNING with a real LLM key in
 * server/.env (this environment: Dahl Inference, DeepSeek-V4-Flash).
 * This script performs REAL LLM work — nothing is mocked:
 *   1. GET /health                       -> expects phase 3
 *   2. Approval gate: goal with requiresApproval parks in
 *      waiting_approval, a second goal is rejected, the first is
 *      approved and then runs to completion.
 *   3. Main E2E goal (Instagram content plan for a coffee shop):
 *      Nova plans -> specialists execute -> artifacts in DB ->
 *      token totals (from provider usage) increase.
 *   4. Live chat with Sora returns a real reply and is recorded.
 *   5. A 3-agent meeting completes with a transcript, action items,
 *      and a minutes artifact.
 *
 * Secrets are read from server/.env and never printed.
 * Run: node scripts/test-gate3.mjs   (from repo root)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'server');
const serverRequire = createRequire(resolve(serverDir, 'package.json'));
const Database = serverRequire('better-sqlite3');

const env = {};
for (const line of readFileSync(resolve(serverDir, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const PORT = Number(env.PORT ?? 4000);
const DB_PATH = resolve(serverDir, env.DATABASE_PATH ?? './data/living-world.db');
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function waitForTask(id, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let task = null;
  while (Date.now() < deadline) {
    const res = await get(`/api/tasks/${id}`);
    task = res.body;
    if (task.status === 'completed' || task.status === 'failed') return task;
    await sleep(3000);
  }
  return task;
}

/* --- 1. health ------------------------------------------------------------ */
const health = (await get('/health')).body;
check('GET /health reports phase 3', health.status === 'ok' && health.phase === 3, JSON.stringify(health));

const statsBefore = (await get('/api/stats')).body;
console.log(`INFO  total tokens before: ${statsBefore.totalTokens}`);

/* --- 2. approval gate ------------------------------------------------------ */
const gated = await post('/api/run', {
  prompt: 'Write a one-sentence morning greeting for the office team.',
  requiresApproval: true,
});
check('approval goal created', gated.status === 201, `status=${gated.status}`);
check(
  'approval goal parks in waiting_approval',
  gated.body.status === 'waiting_approval',
  `status=${gated.body.status}`,
);
await sleep(3000);
const stillParked = (await get(`/api/tasks/${gated.body.id}`)).body;
check('goal stays parked while unapproved', stillParked.status === 'waiting_approval', `status=${stillParked.status}`);

const rejected = await post('/api/run', {
  prompt: 'Write a one-sentence afternoon greeting for the office team.',
  requiresApproval: true,
});
const rejectRes = await post(`/api/tasks/${rejected.body.id}/reject`);
check(
  'reject moves goal to failed with honest errorLog',
  rejectRes.body.status === 'failed' && /Rejected by operator/.test(rejectRes.body.errorLog ?? ''),
  `status=${rejectRes.body.status}`,
);

const approveRes = await post(`/api/tasks/${gated.body.id}/approve`);
check('approve releases the gate', approveRes.status === 200 && approveRes.body.status === 'queued', `status=${approveRes.body?.status}`);
const gatedFinal = await waitForTask(gated.body.id, 600_000);
check('approved goal runs to completion', gatedFinal?.status === 'completed', `status=${gatedFinal?.status} error=${gatedFinal?.errorLog ?? ''}`);

/* --- 3. main E2E goal ------------------------------------------------------- */
const goalRes = await post('/api/run', {
  prompt:
    'Buat rencana konten 3 postingan Instagram untuk kedai kopi kecil, lengkap dengan 1 contoh caption siap pakai.',
});
check('main goal accepted', goalRes.status === 201, `status=${goalRes.status}`);
const goalId = goalRes.body.id;
const goalFinal = await waitForTask(goalId, 600_000);
check('main goal completed', goalFinal?.status === 'completed', `status=${goalFinal?.status} error=${goalFinal?.errorLog ?? ''}`);

const allTasks = (await get('/api/tasks')).body;
const children = allTasks
  .filter((t) => t.parentTaskId === goalId)
  .sort((a, b) => a.createdAt - b.createdAt);
check('Nova created >= 2 subtasks', children.length >= 2, `children=${children.length}`);
check(
  'all subtasks completed',
  children.length > 0 && children.every((c) => c.status === 'completed'),
  children.map((c) => `${c.title}:${c.status}`).join(' | '),
);

const allArtifacts = (await get('/api/artifacts')).body;
let artifactOk = children.length > 0;
let sampleExcerpt = '';
for (const child of children) {
  const art = allArtifacts.find((a) => a.id === child.resultArtifactId);
  if (!art || art.contentText.trim().length < 80) artifactOk = false;
  if (art && !sampleExcerpt) sampleExcerpt = art.contentText.slice(0, 220).replace(/\n/g, ' ');
}
check('every subtask produced a real artifact (>80 chars)', artifactOk);
console.log(`INFO  sample artifact excerpt: "${sampleExcerpt}"`);
const parentArt = allArtifacts.find((a) => a.id === goalFinal?.resultArtifactId);
check('goal has a compiled result artifact', !!parentArt, parentArt?.filename ?? 'none');

const db = new Database(DB_PATH, { readonly: true });
const events = db
  .prepare('SELECT event_type, payload_json FROM task_events WHERE task_id = ? OR task_id IN (SELECT id FROM tasks WHERE parent_task_id = ?) ORDER BY id')
  .all(goalId, goalId);
const types = events.map((e) => e.event_type);
check('plan_created event recorded', types.includes('plan_created'));
check('llm_usage events recorded', types.filter((t) => t === 'llm_usage').length >= children.length + 1, `count=${types.filter((t) => t === 'llm_usage').length}`);
check('artifact_created events recorded', types.filter((t) => t === 'artifact_created').length >= children.length);
const stateEvents = events
  .filter((e) => e.event_type === 'agent_state')
  .map((e) => JSON.parse(e.payload_json));
check(
  'agent_state events use source=internal',
  stateEvents.length > 0 && stateEvents.every((e) => e.source === 'internal'),
  `count=${stateEvents.length}`,
);
const usageSum = db
  .prepare("SELECT COALESCE(SUM(json_extract(payload_json, '$.totalTokens')), 0) AS s FROM task_events WHERE event_type = 'llm_usage' AND (task_id = ? OR task_id IN (SELECT id FROM tasks WHERE parent_task_id = ?))")
  .get(goalId, goalId).s;
check('provider usage tokens for this goal > 0', usageSum > 0, `tokens=${usageSum}`);
db.close();

const statsAfter = (await get('/api/stats')).body;
check(
  'agent token totals increased (real usage)',
  statsAfter.totalTokens > statsBefore.totalTokens,
  `${statsBefore.totalTokens} -> ${statsAfter.totalTokens}`,
);

/* --- 4. live chat ------------------------------------------------------------ */
const chatRes = await post('/api/chat', {
  agentId: 'agent-researcher-1',
  message: 'Halo Sora, perkenalkan dirimu dalam satu kalimat.',
});
check('chat returns a real reply', chatRes.status === 200 && (chatRes.body.reply ?? '').length > 10, `status=${chatRes.status}`);
console.log(`INFO  chat reply excerpt: "${(chatRes.body.reply ?? '').slice(0, 140)}"`);
const history = (await get('/api/chat/agent-researcher-1')).body;
check('chat history recorded (user + assistant)', (history.messages ?? []).length >= 2, `messages=${(history.messages ?? []).length}`);

/* --- 5. meeting ---------------------------------------------------------------- */
const artifactIdsBeforeMeeting = new Set(
  (await get('/api/artifacts')).body.map((a) => a.id),
);
const meetingRes = await post('/api/meetings', {
  topic: 'Should our little coffee shop open at 6 AM on weekdays?',
  participantIds: ['agent-manager-1', 'agent-researcher-1', 'agent-designer-1'],
});
check('meeting created', meetingRes.status === 201, `status=${meetingRes.status}`);
const meetingId = meetingRes.body.id;
let meeting = null;
{
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    meeting = (await get(`/api/meetings/${meetingId}`)).body;
    if (meeting.status === 'completed' || meeting.status === 'failed') break;
    await sleep(3000);
  }
}
check('meeting completed', meeting?.status === 'completed', `status=${meeting?.status}`);
check('meeting transcript has >= 4 turns', (meeting?.transcript ?? []).length >= 4, `turns=${(meeting?.transcript ?? []).length}`);
check('meeting produced action items', (meeting?.actionItems ?? []).length >= 1, `items=${(meeting?.actionItems ?? []).length}`);
const minutesArt = (await get('/api/artifacts')).body.find(
  (a) => a.filename.startsWith('meeting-minutes-') && !artifactIdsBeforeMeeting.has(a.id),
);
check('meeting minutes artifact saved (new, from this meeting)', !!minutesArt, minutesArt?.filename ?? 'none');

console.log(failures === 0 ? '\nGATE 3 E2E: ALL CHECKS PASSED' : `\nGATE 3 E2E: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
