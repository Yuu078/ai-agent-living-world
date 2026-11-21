/**
 * Task orchestrator (Phase 3) — real multi-agent LLM collaboration.
 *
 * Flow: a user goal becomes a parent task owned by Nova (Manager).
 * Nova calls the LLM to break the goal into subtasks; each subtask is
 * executed by the agent whose role fits, via a REAL LLM call using
 * that agent's seeded system prompt. Every step emits the Section 5
 * `agent:state_change` event (source `internal`), is persisted to
 * `task_events`, and produces a real artifact in the `artifacts`
 * table. Token totals come from provider usage — never invented.
 *
 * NO FAKE WORK: if the LLM is unconfigured or a call fails, the task
 * is marked `failed` with the honest error in `error_log`, the agent
 * shows the `error` state, and Retry (Phase 2 endpoint) can resume:
 * completed subtasks are kept, the rest re-run.
 *
 * Human approval gate: goals flagged `requiresApproval` — or whose
 * prompt contains a risky keyword — park in `waiting_approval` until
 * POST /api/tasks/:id/approve (or /reject) is called.
 */
import { randomBytes } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { AgentState, TargetZone, WorldEvent } from '@living-world/shared';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { agents, artifacts, meetings, taskEvents, tasks } from '../db/schema.js';
import { emitStateChange } from '../realtime.js';
import { chatCompletion, LlmError, type TokenUsage } from './llmAdapter.js';
import { runSummary, slugify, writeArtifact } from './tools.js';

export const MANAGER_ID = 'agent-manager-1';

const RISKY_KEYWORDS: readonly string[] = [
  'delete',
  'drop table',
  'publish',
  'deploy',
  'send email',
  'send an email',
  'payment',
  'pay ',
  'transfer funds',
  'production database',
  'remove all',
];

type TaskRow = typeof tasks.$inferSelect;
type AgentRow = typeof agents.$inferSelect;

interface PlanItem {
  title: string;
  prompt: string;
  role: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (text: string, n = 90) =>
  text.length > n ? `${text.slice(0, n - 1)}…` : text;

/* ------------------------------------------------------------------ */
/* Persistence helpers                                                 */
/* ------------------------------------------------------------------ */

function getTask(id: string): TaskRow | undefined {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

function getAgent(id: string): AgentRow | undefined {
  return db.select().from(agents).where(eq(agents.id, id)).get();
}

function logEvent(
  taskId: string | null,
  agentId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  db.insert(taskEvents)
    .values({
      taskId,
      agentId,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: Date.now(),
    })
    .run();
}

function setTaskStatus(
  row: TaskRow,
  status: TaskRow['status'],
  extra: Partial<TaskRow> = {},
): TaskRow {
  const previousStatus = row.status;
  db.update(tasks)
    .set({ status, ...extra })
    .where(eq(tasks.id, row.id))
    .run();
  const updated = getTask(row.id) ?? { ...row, status, ...extra };
  logEvent(updated.id, updated.assignedAgentId, 'task_status', {
    taskId: updated.id,
    status,
    previousStatus,
  });
  return updated;
}

/**
 * Emit one Section 5 state change: broadcast to the 3D world, mirror
 * into `agents.status`, and persist to `task_events`.
 */
function emitAgentState(
  agentId: string,
  state: AgentState,
  targetZone: TargetZone,
  thoughtBubble: string | undefined,
  taskId?: string,
  tokensUsed?: number,
): void {
  const event: WorldEvent = {
    agentId,
    source: 'internal',
    state,
    targetZone,
    thoughtBubble,
    taskId,
    tokensUsed,
    costUsd: 0,
    timestamp: Date.now(),
  };
  emitStateChange(event);
  db.update(agents).set({ status: state }).where(eq(agents.id, agentId)).run();
  logEvent(taskId ?? null, agentId, 'agent_state', { ...event });
}

/** Fold real provider usage into the agent's lifetime totals. */
function addUsage(agentId: string, taskId: string | null, usage: TokenUsage): void {
  const agent = getAgent(agentId);
  if (!agent) return;
  db.update(agents)
    .set({
      totalTokens: agent.totalTokens + usage.totalTokens,
      // Dahl is free for this deployment; cost stays a truthful 0.
      totalCostUsd: agent.totalCostUsd + 0,
    })
    .where(eq(agents.id, agentId))
    .run();
  logEvent(taskId, agentId, 'llm_usage', {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    costUsd: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Goal submission + approval gate                                     */
/* ------------------------------------------------------------------ */

export function goalNeedsApproval(prompt: string, flag?: boolean): boolean {
  if (flag) return true;
  const lower = ` ${prompt.toLowerCase()} `;
  return RISKY_KEYWORDS.some((k) => lower.includes(k));
}

export interface SubmitGoalInput {
  title?: string;
  prompt: string;
  requiresApproval?: boolean;
}

export function submitGoal(input: SubmitGoalInput): TaskRow {
  const now = Date.now();
  const row: TaskRow = {
    id: `task_${randomBytes(4).toString('hex')}`,
    title: input.title?.trim() || short(input.prompt, 60),
    prompt: input.prompt,
    assignedAgentId: MANAGER_ID,
    parentTaskId: null,
    status: 'queued',
    priority: 'normal',
    resultArtifactId: null,
    errorLog: null,
    createdAt: now,
  };
  db.insert(tasks).values(row).run();
  logEvent(row.id, MANAGER_ID, 'goal_submitted', {
    taskId: row.id,
    requiresApproval: input.requiresApproval === true,
  });
  logEvent(row.id, MANAGER_ID, 'task_status', {
    taskId: row.id,
    status: row.status,
    previousStatus: null,
  });

  if (goalNeedsApproval(input.prompt, input.requiresApproval)) {
    const parked = setTaskStatus(row, 'waiting_approval');
    logEvent(row.id, MANAGER_ID, 'approval_requested', { taskId: row.id });
    emitAgentState(
      MANAGER_ID,
      'thinking',
      'desk',
      'Waiting for human approval before starting this goal…',
      row.id,
    );
    return parked;
  }
  enqueueGoal(row.id);
  return row;
}

export function approveTask(id: string): TaskRow | { error: string; code: number } {
  const row = getTask(id);
  if (!row) return { error: 'task not found', code: 404 };
  if (row.status !== 'waiting_approval') {
    return {
      error: `only a waiting_approval task can be approved (current status: '${row.status}')`,
      code: 409,
    };
  }
  const updated = setTaskStatus(row, 'queued', { errorLog: null });
  logEvent(id, row.assignedAgentId, 'approval_granted', { taskId: id });
  emitAgentState(MANAGER_ID, 'idle', 'desk', undefined, id);
  enqueueGoal(id);
  return updated;
}

export function rejectTask(id: string): TaskRow | { error: string; code: number } {
  const row = getTask(id);
  if (!row) return { error: 'task not found', code: 404 };
  if (row.status !== 'waiting_approval') {
    return {
      error: `only a waiting_approval task can be rejected (current status: '${row.status}')`,
      code: 409,
    };
  }
  const updated = setTaskStatus(row, 'failed', {
    errorLog: 'Rejected by operator at the human approval gate',
  });
  logEvent(id, row.assignedAgentId, 'approval_rejected', { taskId: id });
  emitAgentState(MANAGER_ID, 'idle', 'desk', undefined, id);
  return updated;
}

/* ------------------------------------------------------------------ */
/* Cancellation + retry hooks (used by the Phase 2 task routes)        */
/* ------------------------------------------------------------------ */

const abortedRuns = new Set<string>();

/** Cooperative cancellation: the run loop checks this between steps. */
export function abortTask(id: string): void {
  abortedRuns.add(id);
  const children = db
    .select()
    .from(tasks)
    .where(eq(tasks.parentTaskId, id))
    .all();
  for (const child of children) abortedRuns.add(child.id);
}

/** True when the task was created via POST /api/run (a goal). */
function isGoal(id: string): boolean {
  const rows = db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, id))
    .all();
  return rows.some((r) => r.eventType === 'goal_submitted');
}

/**
 * Called by the Phase 2 retry endpoint after it resets a failed task
 * to `queued`: goals resume orchestration (completed subtasks are
 * kept); plain tasks simply stay queued as before.
 */
export function kickRetry(id: string): void {
  if (!isGoal(id)) return;
  abortedRuns.delete(id);
  enqueueGoal(id);
}

/* ------------------------------------------------------------------ */
/* Planning (Nova / Manager)                                           */
/* ------------------------------------------------------------------ */

function pickAgentForRole(role: string, load: Map<string, number>): AgentRow {
  const all = db.select().from(agents).all();
  const norm = role.toLowerCase();
  let wanted: string | null = null;
  if (norm.includes('research')) wanted = 'Researcher';
  else if (norm.includes('design')) wanted = 'Designer';
  else if (norm.includes('qa') || norm.includes('test')) wanted = 'QA Engineer';
  else if (norm.includes('manag')) wanted = 'Manager';
  else if (
    norm.includes('program') ||
    norm.includes('develop') ||
    norm.includes('engineer') ||
    norm.includes('code')
  )
    wanted = 'Programmer';

  const candidates = wanted ? all.filter((a) => a.role === wanted) : [];
  const pool = candidates.length > 0 ? candidates : all.filter((a) => a.id !== MANAGER_ID);
  pool.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
  const chosen = pool[0] ?? all[0];
  if (!chosen) throw new Error('No agents are seeded in the DB');
  return chosen;
}

function parsePlan(raw: string): PlanItem[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new LlmError('Manager plan was not valid JSON (no JSON object found)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new LlmError('Manager plan was not valid JSON (parse failed)');
  }
  const items = (parsed as { subtasks?: unknown }).subtasks;
  if (!Array.isArray(items) || items.length === 0) {
    throw new LlmError('Manager plan contained no subtasks');
  }
  return items.slice(0, 6).map((item, i) => {
    const rec = (item ?? {}) as Record<string, unknown>;
    const title =
      typeof rec.title === 'string' && rec.title.trim()
        ? rec.title.trim()
        : `Subtask ${i + 1}`;
    const prompt =
      typeof rec.prompt === 'string' && rec.prompt.trim()
        ? rec.prompt.trim()
        : title;
    const role = typeof rec.role === 'string' ? rec.role : 'Programmer';
    return { title, prompt, role };
  });
}

async function planWithManager(goal: TaskRow): Promise<PlanItem[]> {
  const nova = getAgent(MANAGER_ID);
  if (!nova) throw new Error('Manager agent (Nova) not found in DB');
  emitAgentState(MANAGER_ID, 'walking', 'desk', 'Heading to my desk to plan…', goal.id);
  await sleep(700);
  emitAgentState(
    MANAGER_ID,
    'thinking',
    'desk',
    `Breaking down the goal: ${short(goal.title, 50)}`,
    goal.id,
  );
  const system = `${nova.systemPrompt}\n\nYou are the planner for a small AI office. Respond with ONLY a JSON object, no prose, no code fences.`;
  const ask = [
    `Goal from the user: ${goal.prompt}`,
    '',
    'Break it into 2-4 concrete subtasks. Available roles: Researcher, Programmer, Designer, QA Engineer.',
    'Assign research/information gathering to Researcher, writing/coding/technical production to Programmer, visual/copy/design work to Designer, and a final review/verification pass to QA Engineer when useful.',
    'JSON shape: {"subtasks":[{"title":"short title","prompt":"detailed self-contained instruction for the specialist","role":"Researcher|Programmer|Designer|QA Engineer"}]}',
  ].join('\n');

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await chatCompletion({
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              attempt === 0
                ? ask
                : `${ask}\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object.`,
          },
        ],
        // Reasoning models spend part of the budget on an inline
        // <think> scratchpad (stripped by the adapter); 1200 tokens
        // leaves room for the JSON plan itself.
        maxTokens: 1200,
        temperature: 0.3,
        timeoutMs: 150_000,
      });
      addUsage(MANAGER_ID, goal.id, result.usage);
      const plan = parsePlan(result.content);
      logEvent(goal.id, MANAGER_ID, 'plan_created', {
        taskId: goal.id,
        subtasks: plan,
      });
      return plan;
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof LlmError &&
        (err.message.includes('JSON') || err.message.includes('empty response'));
      if (!retryable) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Planning failed');
}

function loadStoredPlan(goalId: string): PlanItem[] | null {
  const rows = db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, goalId))
    .orderBy(asc(taskEvents.id))
    .all();
  const planRow = [...rows].reverse().find((r) => r.eventType === 'plan_created');
  if (!planRow) return null;
  try {
    const payload = JSON.parse(planRow.payloadJson) as { subtasks?: PlanItem[] };
    return Array.isArray(payload.subtasks) && payload.subtasks.length > 0
      ? payload.subtasks
      : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Subtask execution                                                   */
/* ------------------------------------------------------------------ */

async function executeSubtask(
  goal: TaskRow,
  child: TaskRow,
  contextSummaries: string[],
): Promise<string> {
  const agent = getAgent(child.assignedAgentId);
  if (!agent) throw new Error(`Agent not found: ${child.assignedAgentId}`);
  let current = setTaskStatus(child, 'running', { errorLog: null });

  emitAgentState(agent.id, 'walking', 'desk', `Heading to my desk — ${short(child.title, 45)}`, child.id);
  await sleep(900);
  if (abortedRuns.has(goal.id) || abortedRuns.has(child.id)) {
    throw new Error('Cancelled by operator');
  }
  emitAgentState(agent.id, 'thinking', 'desk', `Planning: ${short(child.title, 55)}`, child.id);
  await sleep(350);
  emitAgentState(agent.id, 'typing', 'desk', `Working on: ${short(child.title, 55)}`, child.id);

  const context =
    contextSummaries.length > 0
      ? contextSummaries.join('\n\n---\n\n')
      : '(no teammate output yet — you are first)';
  const result = await chatCompletion({
    messages: [
      { role: 'system', content: agent.systemPrompt },
      {
        role: 'user',
        content: [
          `Overall goal: ${goal.prompt}`,
          '',
          `Your subtask (${child.title}): ${child.prompt}`,
          '',
          'Summaries of what your teammates have already produced:',
          context,
          '',
          'Produce YOUR deliverable for this subtask in Markdown. Be concrete and complete, but concise (aim for under 500 words). Do not describe what you would do — produce the actual content.',
        ].join('\n'),
      },
    ],
    maxTokens: 1100,
    temperature: 0.6,
    timeoutMs: 150_000,
  });
  addUsage(agent.id, child.id, result.usage);

  const artifact = writeArtifact({
    taskId: child.id,
    agentId: agent.id,
    filename: `${slugify(child.title)}.md`,
    contentText: result.content,
  });
  logEvent(child.id, agent.id, 'artifact_created', {
    taskId: child.id,
    artifactId: artifact.id,
    filename: artifact.filename,
  });
  current = setTaskStatus(current, 'completed', {
    resultArtifactId: artifact.id,
    errorLog: null,
  });

  emitAgentState(agent.id, 'celebrating', 'desk', `Done: ${short(child.title, 55)}`, child.id, result.usage.totalTokens);
  await sleep(700);
  emitAgentState(agent.id, 'idle', 'desk', undefined, child.id);
  return result.content;
}

/* ------------------------------------------------------------------ */
/* Goal run loop                                                       */
/* ------------------------------------------------------------------ */

const goalQueue: string[] = [];
let processingQueue = false;

function enqueueGoal(taskId: string): void {
  if (!goalQueue.includes(taskId)) goalQueue.push(taskId);
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (goalQueue.length > 0) {
      const taskId = goalQueue.shift()!;
      try {
        await runGoal(taskId);
      } catch (err) {
        // runGoal handles its own failure bookkeeping; this is a
        // last-resort guard so one bad goal never kills the queue.
        console.error(`[orchestrator] unexpected run failure for ${taskId}:`, err);
      }
    }
  } finally {
    processingQueue = false;
  }
}

async function runGoal(goalId: string): Promise<void> {
  let goal = getTask(goalId);
  if (!goal) return;
  if (goal.status !== 'queued' && goal.status !== 'running') return;
  abortedRuns.delete(goalId);
  goal = setTaskStatus(goal, 'running', { errorLog: null });

  let currentChild: TaskRow | null = null;
  let currentAgentId: string = MANAGER_ID;
  try {
    const plan = loadStoredPlan(goalId) ?? (await planWithManager(goal));

    // Ensure one child task per plan item (resume-safe: existing
    // children are matched by creation order).
    const existingChildren = db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, goalId))
      .orderBy(asc(tasks.createdAt))
      .all();
    const load = new Map<string, number>();
    const children: TaskRow[] = [];
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      if (!item) continue;
      let child = existingChildren[i];
      if (!child) {
        const agent = pickAgentForRole(item.role, load);
        load.set(agent.id, (load.get(agent.id) ?? 0) + 1);
        child = {
          id: `task_${randomBytes(4).toString('hex')}`,
          title: item.title,
          prompt: item.prompt,
          assignedAgentId: agent.id,
          parentTaskId: goalId,
          status: 'queued',
          priority: goal.priority,
          resultArtifactId: null,
          errorLog: null,
          createdAt: Date.now() + i,
        };
        db.insert(tasks).values(child).run();
        logEvent(child.id, agent.id, 'task_status', {
          taskId: child.id,
          status: 'queued',
          previousStatus: null,
        });
      } else {
        load.set(child.assignedAgentId, (load.get(child.assignedAgentId) ?? 0) + 1);
      }
      children.push(child);
    }

    const contextSummaries: string[] = [];
    for (const child of children) {
      if (abortedRuns.has(goalId)) throw new Error('Cancelled by operator');
      currentChild = child;
      currentAgentId = child.assignedAgentId;
      if (child.status === 'completed' && child.resultArtifactId) {
        const art = db
          .select()
          .from(artifacts)
          .where(eq(artifacts.id, child.resultArtifactId))
          .get();
        if (art) {
          contextSummaries.push(
            `## ${child.title} (by ${getAgent(child.assignedAgentId)?.name ?? child.assignedAgentId})\n${runSummary(art.contentText)}`,
          );
          continue;
        }
      }
      const content = await executeSubtask(goal, child, contextSummaries);
      contextSummaries.push(
        `## ${child.title} (by ${getAgent(child.assignedAgentId)?.name ?? child.assignedAgentId})\n${runSummary(content)}`,
      );
    }

    // Compiled index artifact for the goal (deterministic assembly of
    // the real subtask artifacts — clearly labelled, not an LLM call).
    const indexLines = [
      `# Goal result: ${goal.title}`,
      '',
      `Goal prompt: ${goal.prompt}`,
      '',
      'This index was compiled by the orchestrator from the real subtask artifacts below (each produced by a live LLM call).',
      '',
    ];
    for (const child of children) {
      const fresh = getTask(child.id) ?? child;
      const agentName = getAgent(fresh.assignedAgentId)?.name ?? fresh.assignedAgentId;
      indexLines.push(`## ${fresh.title} — ${agentName}`);
      indexLines.push(`Artifact id: ${fresh.resultArtifactId ?? '(none)'}`);
      indexLines.push('');
    }
    indexLines.push('---', '', '## Subtask outputs (summaries)', '', ...contextSummaries);
    const indexArtifact = writeArtifact({
      taskId: goal.id,
      agentId: MANAGER_ID,
      filename: `goal-result-${slugify(goal.title)}.md`,
      contentText: indexLines.join('\n'),
    });
    logEvent(goal.id, MANAGER_ID, 'artifact_created', {
      taskId: goal.id,
      artifactId: indexArtifact.id,
      filename: indexArtifact.filename,
    });
    goal = setTaskStatus(goal, 'completed', {
      resultArtifactId: indexArtifact.id,
      errorLog: null,
    });
    emitAgentState(MANAGER_ID, 'celebrating', 'desk', 'Goal complete — artifacts ready', goal.id);
    await sleep(700);
    emitAgentState(MANAGER_ID, 'idle', 'desk', undefined, goal.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cancelled = message === 'Cancelled by operator';
    if (currentChild && currentChild.status !== 'completed') {
      setTaskStatus(currentChild, 'failed', { errorLog: message });
    }
    const fresh = getTask(goalId);
    if (fresh && fresh.status !== 'failed') {
      setTaskStatus(fresh, 'failed', {
        errorLog: currentChild
          ? `Subtask "${currentChild.title}" failed: ${message}`
          : message,
      });
    }
    if (!cancelled) {
      emitAgentState(
        currentAgentId,
        'error',
        'desk',
        `Error: ${short(message, 70)}`,
        currentChild?.id ?? goalId,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Live chat with one agent                                            */
/* ------------------------------------------------------------------ */

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const chatHistories = new Map<string, ChatTurn[]>();

export function getChatHistory(agentId: string): ChatTurn[] {
  return chatHistories.get(agentId) ?? [];
}

export async function chatWithAgent(
  agentId: string,
  message: string,
): Promise<{ reply: string; usage: TokenUsage; model: string }> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  const history = getChatHistory(agentId);
  emitAgentState(agentId, 'thinking', 'desk', 'Thinking about your message…');
  try {
    const result = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: `${agent.systemPrompt}\n\nYou are chatting live with the operator of the virtual office. Stay in character, be helpful, and keep replies under 120 words.`,
        },
        ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: message },
      ],
      maxTokens: 500,
      temperature: 0.7,
      timeoutMs: 60_000,
    });
    addUsage(agentId, null, result.usage);
    const now = Date.now();
    history.push(
      { role: 'user', content: message, timestamp: now },
      { role: 'assistant', content: result.content, timestamp: now },
    );
    chatHistories.set(agentId, history.slice(-20));
    logEvent(null, agentId, 'chat', {
      agentId,
      userMessage: message,
      reply: result.content,
      tokensUsed: result.usage.totalTokens,
    });
    emitAgentState(agentId, 'typing', 'desk', short(result.content, 80), undefined, result.usage.totalTokens);
    const timer = setTimeout(() => {
      emitAgentState(agentId, 'idle', 'desk', undefined);
    }, 4000);
    timer.unref?.();
    return { reply: result.content, usage: result.usage, model: result.model };
  } catch (err) {
    emitAgentState(
      agentId,
      'error',
      'desk',
      `Chat failed: ${short(err instanceof Error ? err.message : String(err), 60)}`,
    );
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

export interface StartMeetingInput {
  topic: string;
  participantIds?: string[];
}

export function startMeeting(input: StartMeetingInput): { id: string } {
  const all = db.select().from(agents).all();
  let participants = (input.participantIds ?? []).filter((id) =>
    all.some((a) => a.id === id),
  );
  if (participants.length < 2) {
    participants = [MANAGER_ID, 'agent-researcher-1', 'agent-designer-1'].filter(
      (id) => all.some((a) => a.id === id),
    );
  }
  const id = `meeting_${randomBytes(4).toString('hex')}`;
  db.insert(meetings)
    .values({
      id,
      topic: input.topic,
      participantIdsJson: JSON.stringify(participants),
      transcriptJson: '[]',
      actionItemsJson: '[]',
      status: 'running',
    })
    .run();
  logEvent(null, MANAGER_ID, 'meeting_started', { meetingId: id, topic: input.topic });
  void runMeeting(id, input.topic, participants).catch((err) => {
    console.error(`[orchestrator] meeting ${id} failed:`, err);
  });
  return { id };
}

async function runMeeting(
  meetingId: string,
  topic: string,
  participantIds: string[],
): Promise<void> {
  const updateMeeting = (patch: Partial<typeof meetings.$inferSelect>) => {
    db.update(meetings).set(patch).where(eq(meetings.id, meetingId)).run();
  };
  try {
    for (const pid of participantIds) {
      emitAgentState(pid, 'walking', 'meeting_room', `Heading to the meeting: ${short(topic, 40)}`);
    }
    await sleep(1200);

    const transcript: Array<{ agentId: string; agentName: string; text: string; timestamp: number }> = [];
    const rounds = participantIds.length <= 3 ? 2 : 1;
    for (let round = 0; round < rounds; round++) {
      for (const pid of participantIds) {
        const agent = getAgent(pid);
        if (!agent) continue;
        emitAgentState(pid, 'meeting', 'meeting_room', `${agent.name} is speaking…`);
        const soFar =
          transcript.length > 0
            ? transcript.map((t) => `${t.agentName}: ${t.text}`).join('\n')
            : '(you are the first speaker)';
        const result = await chatCompletion({
          messages: [
            { role: 'system', content: agent.systemPrompt },
            {
              role: 'user',
              content: [
                `Meeting topic: ${topic}`,
                '',
                'Discussion so far:',
                soFar,
                '',
                round === 0
                  ? 'Give your opening contribution: your view and one concrete proposal. 2-4 sentences.'
                  : 'Respond to the discussion so far: agree, challenge, or add something concrete. 2-4 sentences.',
              ].join('\n'),
            },
          ],
          maxTokens: 400,
          temperature: 0.7,
          timeoutMs: 60_000,
        });
        addUsage(pid, null, result.usage);
        transcript.push({
          agentId: pid,
          agentName: agent.name,
          text: result.content,
          timestamp: Date.now(),
        });
        updateMeeting({ transcriptJson: JSON.stringify(transcript) });
        emitAgentState(pid, 'meeting', 'meeting_room', short(result.content, 80), undefined, result.usage.totalTokens);
        await sleep(300);
      }
    }

    // Minutes + action items, written by Nova (or the first
    // participant) from the REAL transcript.
    const minutesAuthor = participantIds.includes(MANAGER_ID)
      ? MANAGER_ID
      : participantIds[0] ?? MANAGER_ID;
    const author = getAgent(minutesAuthor);
    emitAgentState(minutesAuthor, 'typing', 'meeting_room', 'Writing the meeting minutes…');
    const minutesMessages = [
      {
        role: 'system' as const,
        content: `${author?.systemPrompt ?? ''}\n\nYou write crisp meeting minutes.`,
      },
      {
        role: 'user' as const,
        content: [
          `Meeting topic: ${topic}`,
          '',
          'Transcript:',
          transcript.map((t) => `${t.agentName}: ${t.text}`).join('\n'),
          '',
          'Write minutes in Markdown with exactly these sections: "## Summary" (2-3 sentences), "## Decisions" (bullet list), "## Action Items" (bullet list, each line starting with "- [ ]" and naming an owner when the transcript implies one).',
        ].join('\n'),
      },
    ];
    // The minutes are the meeting's deliverable — one retry when the
    // model burns its whole budget on its <think> scratchpad and
    // returns nothing (observed live with MiniMax on Dahl).
    let minutes: Awaited<ReturnType<typeof chatCompletion>> | null = null;
    let minutesError: unknown = null;
    for (let attempt = 0; attempt < 2 && !minutes; attempt++) {
      try {
        minutes = await chatCompletion({
          messages: minutesMessages,
          maxTokens: 1200,
          temperature: 0.4,
          timeoutMs: 60_000,
        });
      } catch (err) {
        minutesError = err;
        if (
          !(err instanceof LlmError) ||
          !err.message.includes('empty response')
        ) {
          throw err;
        }
      }
    }
    if (!minutes) throw minutesError;
    addUsage(minutesAuthor, null, minutes.usage);

    // Extract action items: any list line under an "Action Items"
    // heading (## heading or bold label), tolerating "- [ ]", "-",
    // "*" and numbered formats.
    const actionItems: string[] = [];
    let inActionSection = false;
    for (const line of minutes.content.split('\n')) {
      if (/^#{1,4}\s+/.test(line) || /^\*\*[^*]+:\*\*\s*$/.test(line)) {
        inActionSection = /action items/i.test(line);
        continue;
      }
      if (inActionSection) {
        const m = line.match(/^\s*(?:[-*]|\d+[.)])\s*(?:\[\s*\]\s*)?(.+)$/);
        if (m?.[1]) actionItems.push(m[1].trim());
      }
    }

    const artifact = writeArtifact({
      taskId: null,
      agentId: minutesAuthor,
      filename: `meeting-minutes-${slugify(topic)}.md`,
      contentText: `# Meeting minutes: ${topic}\n\n${minutes.content}\n\n---\n\n## Full transcript\n\n${transcript.map((t) => `**${t.agentName}:** ${t.text}`).join('\n\n')}\n`,
    });
    updateMeeting({
      transcriptJson: JSON.stringify(transcript),
      actionItemsJson: JSON.stringify(actionItems),
      status: 'completed',
    });
    logEvent(null, minutesAuthor, 'meeting_completed', {
      meetingId,
      artifactId: artifact.id,
      actionItems,
    });
    for (const pid of participantIds) {
      emitAgentState(pid, 'celebrating', 'meeting_room', 'Meeting wrapped up — minutes saved');
    }
    await sleep(700);
    for (const pid of participantIds) {
      emitAgentState(pid, 'idle', 'desk', undefined);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateMeeting({ status: 'failed' });
    logEvent(null, MANAGER_ID, 'meeting_failed', { meetingId, error: message });
    for (const pid of participantIds) {
      emitAgentState(pid, 'error', 'meeting_room', `Meeting failed: ${short(message, 55)}`);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Stats + boot                                                        */
/* ------------------------------------------------------------------ */

export function getStats() {
  const all = db.select().from(agents).all();
  return {
    totalTokens: all.reduce((sum, a) => sum + a.totalTokens, 0),
    totalCostUsd: all.reduce((sum, a) => sum + a.totalCostUsd, 0),
    perAgent: all.map((a) => ({
      agentId: a.id,
      totalTokens: a.totalTokens,
      totalCostUsd: a.totalCostUsd,
    })),
  };
}

/**
 * Boot-time setup: point agent rows at the real configured model
 * (honest labelling) and recover from a previous crash — tasks left
 * `running` are failed honestly; queued goals are re-enqueued.
 */
export function initOrchestrator(): void {
  if (config.llm.apiKey.trim().length > 0) {
    db.update(agents).set({ model: config.llm.defaultModel }).run();
  }
  const stale = db
    .select()
    .from(tasks)
    .where(eq(tasks.status, 'running'))
    .all();
  for (const row of stale) {
    setTaskStatus(row, 'failed', {
      errorLog: 'Server restarted while this task was running',
    });
  }
  const queued = db
    .select()
    .from(tasks)
    .where(eq(tasks.status, 'queued'))
    .all();
  for (const row of queued) {
    if (row.parentTaskId === null && isGoal(row.id)) enqueueGoal(row.id);
  }
}
