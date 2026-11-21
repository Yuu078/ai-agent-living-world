/**
 * External Telemetry Bridge — POST /api/telemetry (AGENTS.md
 * Sections 5 & 8). External agents/scripts authenticate with a
 * Bearer secret, then drive a 3D avatar live: the event is persisted
 * to `task_events`, folded into the agent's status + token/cost
 * totals, and broadcast over Socket.IO as `agent:state_change`.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { WorldEvent } from '@living-world/shared';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { agents, taskEvents, tasks } from '../db/schema.js';
import { emitStateChange } from '../realtime.js';

// Mirror of AGENT_STATES / TARGET_ZONES in shared/types.ts — the
// server imports shared types only, so runtime lists live here.
const AGENT_STATES: readonly string[] = [
  'idle',
  'walking',
  'sitting',
  'thinking',
  'typing',
  'tool_calling',
  'meeting',
  'celebrating',
  'error',
  'coffee_break',
];
const TARGET_ZONES: readonly string[] = [
  'desk',
  'meeting_room',
  'coffee_bar',
  'lounge',
  'reception',
  'garden',
  'lab',
  'executive',
];
const EVENT_SOURCES: readonly string[] = ['internal', 'external_webhook'];

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export default async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/telemetry', async (req, reply) => {
    // --- Auth: Bearer telemetry secret -------------------------------
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${config.telemetrySecret}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // --- Validation ---------------------------------------------------
    const body = asRecord(req.body);
    const details: string[] = [];

    if (!isNonEmptyString(body.agentId)) {
      details.push('agentId is required (non-empty string)');
    }
    if (typeof body.state !== 'string' || !AGENT_STATES.includes(body.state)) {
      details.push(`state must be one of: ${AGENT_STATES.join(', ')}`);
    }
    if (typeof body.targetZone !== 'string' || !TARGET_ZONES.includes(body.targetZone)) {
      details.push(`targetZone must be one of: ${TARGET_ZONES.join(', ')}`);
    }
    if (
      body.source !== undefined &&
      (typeof body.source !== 'string' || !EVENT_SOURCES.includes(body.source))
    ) {
      details.push("source must be 'internal' or 'external_webhook'");
    }
    if (body.thoughtBubble !== undefined && typeof body.thoughtBubble !== 'string') {
      details.push('thoughtBubble must be a string');
    }
    if (body.taskId !== undefined && typeof body.taskId !== 'string') {
      details.push('taskId must be a string');
    }
    if (body.tokensUsed !== undefined && !isValidAmount(body.tokensUsed)) {
      details.push('tokensUsed must be a number >= 0');
    }
    if (body.costUsd !== undefined && !isValidAmount(body.costUsd)) {
      details.push('costUsd must be a number >= 0');
    }
    if (
      body.timestamp !== undefined &&
      (typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp))
    ) {
      details.push('timestamp must be a number (epoch ms)');
    }
    if (details.length > 0) {
      return reply.code(400).send({ error: 'invalid telemetry payload', details });
    }

    const agentId = body.agentId as string;
    const agent = db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();
    if (!agent) {
      return reply
        .code(400)
        .send({ error: 'unknown agentId', details: [`no agent with id '${agentId}'`] });
    }

    // --- Build the contract event -------------------------------------
    const now = Date.now();
    const event: WorldEvent = {
      agentId,
      source: (body.source as WorldEvent['source'] | undefined) ?? 'external_webhook',
      state: body.state as WorldEvent['state'],
      targetZone: body.targetZone as WorldEvent['targetZone'],
      timestamp: (body.timestamp as number | undefined) ?? now,
    };
    if (typeof body.thoughtBubble === 'string') event.thoughtBubble = body.thoughtBubble;
    if (typeof body.taskId === 'string') event.taskId = body.taskId;
    if (isValidAmount(body.tokensUsed)) event.tokensUsed = body.tokensUsed;
    if (isValidAmount(body.costUsd)) event.costUsd = body.costUsd;

    // --- Persist -------------------------------------------------------
    // task_events.task_id only references real tasks; an unknown
    // taskId stays inside payload_json but leaves the column null.
    let eventTaskId: string | null = null;
    if (event.taskId) {
      const task = db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.id, event.taskId))
        .get();
      eventTaskId = task ? task.id : null;
    }
    db.insert(taskEvents)
      .values({
        taskId: eventTaskId,
        agentId,
        eventType: 'agent:state_change',
        payloadJson: JSON.stringify(event),
        createdAt: now,
      })
      .run();

    db.update(agents)
      .set({
        status: event.state,
        totalTokens: agent.totalTokens + (event.tokensUsed ?? 0),
        totalCostUsd: agent.totalCostUsd + (event.costUsd ?? 0),
      })
      .where(eq(agents.id, agentId))
      .run();

    // --- Broadcast ------------------------------------------------------
    emitStateChange(event);

    return { ok: true, event };
  });
}
