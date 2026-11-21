/**
 * Orchestrator API (Phase 3) — real LLM work entry points.
 *
 * - POST /api/run                 submit a goal for Nova to orchestrate
 * - POST /api/tasks/:id/approve   human approval gate: approve
 * - POST /api/tasks/:id/reject    human approval gate: reject
 * - POST /api/chat                live chat with one agent (real LLM)
 * - GET  /api/chat/:agentId       chat history for one agent
 * - POST /api/meetings            start a real multi-agent meeting
 * - GET  /api/meetings[/:id]      meeting records (transcript + actions)
 * - GET  /api/stats               token/cost totals from the agents table
 *
 * All LLM execution happens here on the server (Hard Rule 4). Errors
 * are returned honestly — there is no mock fallback (Hard Rule 1).
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  MeetingPayload,
  MeetingStatus,
  TaskPayload,
  TaskStatus,
} from '@living-world/shared';
import { db } from '../db/index.js';
import { agents, meetings, tasks } from '../db/schema.js';
import { isLlmConfigured, LlmError } from '../engine/llmAdapter.js';
import {
  approveTask,
  chatWithAgent,
  getChatHistory,
  getStats,
  rejectTask,
  startMeeting,
  submitGoal,
} from '../engine/orchestrator.js';

type TaskRow = typeof tasks.$inferSelect;
type MeetingRow = typeof meetings.$inferSelect;

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toTaskDto(row: TaskRow): TaskPayload {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    assignedAgentId: row.assignedAgentId,
    parentTaskId: row.parentTaskId,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPayload['priority'],
    resultArtifactId: row.resultArtifactId,
    errorLog: row.errorLog,
    createdAt: row.createdAt,
  };
}

function toMeetingDto(row: MeetingRow): MeetingPayload {
  const parse = <T>(json: string, fallback: T): T => {
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  };
  return {
    id: row.id,
    topic: row.topic,
    participantIds: parse<string[]>(row.participantIdsJson, []),
    transcript: parse(row.transcriptJson, []),
    actionItems: parse<string[]>(row.actionItemsJson, []),
    status: row.status as MeetingStatus,
  };
}

function agentExists(id: string): boolean {
  return (
    db.select({ id: agents.id }).from(agents).where(eq(agents.id, id)).get() !==
    undefined
  );
}

export default async function orchestratorRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post('/api/run', async (req, reply) => {
    const body = asRecord(req.body);
    if (!isNonEmptyString(body.prompt)) {
      return reply
        .code(400)
        .send({ error: 'prompt is required (non-empty string)' });
    }
    if (body.title !== undefined && typeof body.title !== 'string') {
      return reply.code(400).send({ error: 'title must be a string when provided' });
    }
    if (
      body.requiresApproval !== undefined &&
      typeof body.requiresApproval !== 'boolean'
    ) {
      return reply
        .code(400)
        .send({ error: 'requiresApproval must be a boolean when provided' });
    }
    if (!isLlmConfigured()) {
      return reply.code(503).send({
        error:
          'LLM is not configured on the server (LLM_API_KEY missing) — goals cannot run; no mock fallback exists.',
      });
    }
    const row = submitGoal({
      title: body.title,
      prompt: body.prompt,
      requiresApproval: body.requiresApproval,
    });
    return reply.code(201).send(toTaskDto(row));
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/approve', async (req, reply) => {
    const result = approveTask(req.params.id);
    if ('error' in result) {
      return reply.code(result.code).send({ error: result.error });
    }
    return toTaskDto(result);
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/reject', async (req, reply) => {
    const result = rejectTask(req.params.id);
    if ('error' in result) {
      return reply.code(result.code).send({ error: result.error });
    }
    return toTaskDto(result);
  });

  app.post('/api/chat', async (req, reply) => {
    const body = asRecord(req.body);
    if (!isNonEmptyString(body.agentId) || !isNonEmptyString(body.message)) {
      return reply
        .code(400)
        .send({ error: 'agentId and message are required (non-empty strings)' });
    }
    if (!agentExists(body.agentId)) {
      return reply
        .code(400)
        .send({ error: `unknown agent: ${body.agentId}` });
    }
    if (!isLlmConfigured()) {
      return reply.code(503).send({
        error:
          'LLM is not configured on the server (LLM_API_KEY missing) — chat cannot run; no mock fallback exists.',
      });
    }
    try {
      const result = await chatWithAgent(body.agentId, body.message);
      return {
        agentId: body.agentId,
        reply: result.reply,
        model: result.model,
        usage: result.usage,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof LlmError && err.status ? err.status : 502;
      return reply.code(code).send({ error: message });
    }
  });

  app.get<{ Params: { agentId: string } }>(
    '/api/chat/:agentId',
    async (req, reply) => {
      if (!agentExists(req.params.agentId)) {
        return reply.code(404).send({ error: 'agent not found' });
      }
      return { agentId: req.params.agentId, messages: getChatHistory(req.params.agentId) };
    },
  );

  app.post('/api/meetings', async (req, reply) => {
    const body = asRecord(req.body);
    if (!isNonEmptyString(body.topic)) {
      return reply.code(400).send({ error: 'topic is required (non-empty string)' });
    }
    let participantIds: string[] | undefined;
    if (body.participantIds !== undefined) {
      if (
        !Array.isArray(body.participantIds) ||
        body.participantIds.some((p) => typeof p !== 'string')
      ) {
        return reply
          .code(400)
          .send({ error: 'participantIds must be an array of agent id strings' });
      }
      participantIds = body.participantIds as string[];
      const unknown = participantIds.filter((id) => !agentExists(id));
      if (unknown.length > 0) {
        return reply
          .code(400)
          .send({ error: `unknown participant ids: ${unknown.join(', ')}` });
      }
      if (participantIds.length < 2) {
        return reply
          .code(400)
          .send({ error: 'a meeting needs at least 2 participants' });
      }
    }
    if (!isLlmConfigured()) {
      return reply.code(503).send({
        error:
          'LLM is not configured on the server (LLM_API_KEY missing) — meetings cannot run; no mock fallback exists.',
      });
    }
    const { id } = startMeeting({ topic: body.topic, participantIds });
    const row = db.select().from(meetings).where(eq(meetings.id, id)).get();
    return reply.code(201).send(row ? toMeetingDto(row) : { id });
  });

  app.get('/api/meetings', async () => {
    const rows = db.select().from(meetings).all();
    return rows.map(toMeetingDto);
  });

  app.get<{ Params: { id: string } }>('/api/meetings/:id', async (req, reply) => {
    const row = db
      .select()
      .from(meetings)
      .where(eq(meetings.id, req.params.id))
      .get();
    if (!row) return reply.code(404).send({ error: 'meeting not found' });
    return toMeetingDto(row);
  });

  app.get('/api/stats', async () => getStats());
}
