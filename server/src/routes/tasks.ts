/**
 * Tasks API — /api/tasks (AGENTS.md Section 6, Phase 2).
 * Create / list / get / assign / cancel / retry. Every status change
 * is recorded in `task_events` with event_type 'task_status'.
 * Execution itself (orchestrator) is Phase 3.
 */
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { TaskPayload, TaskStatus } from '@living-world/shared';
import { db } from '../db/index.js';
import { agents, taskEvents, tasks } from '../db/schema.js';

const PRIORITIES: readonly string[] = ['low', 'normal', 'high'];
const CANCELLABLE: readonly string[] = ['queued', 'running', 'waiting_approval'];

type TaskRow = typeof tasks.$inferSelect;

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toDto(row: TaskRow): TaskPayload {
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

function getTask(id: string): TaskRow | undefined {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

function agentExists(id: string): boolean {
  return db.select({ id: agents.id }).from(agents).where(eq(agents.id, id)).get() !== undefined;
}

function logStatusEvent(row: TaskRow, previousStatus: string | null): void {
  db.insert(taskEvents)
    .values({
      taskId: row.id,
      agentId: row.assignedAgentId,
      eventType: 'task_status',
      payloadJson: JSON.stringify({
        taskId: row.id,
        status: row.status,
        previousStatus,
      }),
      createdAt: Date.now(),
    })
    .run();
}

export default async function tasksRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { status?: string; agentId?: string } }>(
    '/api/tasks',
    async (req) => {
      const conditions: SQL[] = [];
      if (typeof req.query.status === 'string' && req.query.status.length > 0) {
        conditions.push(eq(tasks.status, req.query.status));
      }
      if (typeof req.query.agentId === 'string' && req.query.agentId.length > 0) {
        conditions.push(eq(tasks.assignedAgentId, req.query.agentId));
      }
      const rows =
        conditions.length > 0
          ? db.select().from(tasks).where(and(...conditions)).all()
          : db.select().from(tasks).all();
      return rows.map(toDto);
    },
  );

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const row = getTask(req.params.id);
    if (!row) return reply.code(404).send({ error: 'task not found' });
    return toDto(row);
  });

  app.post('/api/tasks', async (req, reply) => {
    const body = asRecord(req.body);
    const details: string[] = [];
    if (!isNonEmptyString(body.title)) details.push('title is required (non-empty string)');
    if (!isNonEmptyString(body.prompt)) details.push('prompt is required (non-empty string)');
    if (!isNonEmptyString(body.assignedAgentId)) {
      details.push('assignedAgentId is required (non-empty string)');
    }
    if (details.length > 0) {
      return reply.code(400).send({ error: 'invalid task payload', details });
    }

    const assignedAgentId = body.assignedAgentId as string;
    if (!agentExists(assignedAgentId)) {
      return reply
        .code(400)
        .send({ error: 'assignedAgentId does not reference an existing agent', details: [`unknown agent: ${assignedAgentId}`] });
    }

    let parentTaskId: string | null = null;
    if (body.parentTaskId !== undefined && body.parentTaskId !== null) {
      if (!isNonEmptyString(body.parentTaskId)) {
        return reply.code(400).send({ error: 'parentTaskId must be a non-empty string when provided' });
      }
      if (!getTask(body.parentTaskId)) {
        return reply
          .code(400)
          .send({ error: 'parentTaskId does not reference an existing task', details: [`unknown task: ${body.parentTaskId}`] });
      }
      parentTaskId = body.parentTaskId;
    }

    let priority = 'normal';
    if (body.priority !== undefined) {
      if (typeof body.priority !== 'string' || !PRIORITIES.includes(body.priority)) {
        return reply
          .code(400)
          .send({ error: 'invalid priority', details: [`priority must be one of: ${PRIORITIES.join(', ')}`] });
      }
      priority = body.priority;
    }

    const row: TaskRow = {
      id: `task_${randomBytes(4).toString('hex')}`,
      title: body.title as string,
      prompt: body.prompt as string,
      assignedAgentId,
      parentTaskId,
      status: 'queued',
      priority,
      resultArtifactId: null,
      errorLog: null,
      createdAt: Date.now(),
    };
    db.insert(tasks).values(row).run();
    logStatusEvent(row, null);
    return reply.code(201).send(toDto(row));
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/assign', async (req, reply) => {
    const row = getTask(req.params.id);
    if (!row) return reply.code(404).send({ error: 'task not found' });

    const body = asRecord(req.body);
    if (!isNonEmptyString(body.agentId)) {
      return reply.code(400).send({ error: 'agentId is required (non-empty string)' });
    }
    if (!agentExists(body.agentId)) {
      return reply
        .code(400)
        .send({ error: 'agentId does not reference an existing agent', details: [`unknown agent: ${body.agentId}`] });
    }
    if (row.status === 'completed') {
      return reply.code(409).send({ error: 'cannot assign a completed task' });
    }

    db.update(tasks)
      .set({ assignedAgentId: body.agentId })
      .where(eq(tasks.id, row.id))
      .run();
    db.insert(taskEvents)
      .values({
        taskId: row.id,
        agentId: body.agentId,
        eventType: 'task_assigned',
        payloadJson: JSON.stringify({
          taskId: row.id,
          previousAgentId: row.assignedAgentId,
          assignedAgentId: body.agentId,
        }),
        createdAt: Date.now(),
      })
      .run();
    const updated = getTask(row.id);
    return updated ? toDto(updated) : reply.code(404).send({ error: 'task not found' });
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/cancel', async (req, reply) => {
    const row = getTask(req.params.id);
    if (!row) return reply.code(404).send({ error: 'task not found' });
    if (!CANCELLABLE.includes(row.status)) {
      return reply
        .code(409)
        .send({ error: `cannot cancel a task with status '${row.status}'` });
    }
    db.update(tasks)
      .set({ status: 'failed', errorLog: 'Cancelled by operator' })
      .where(eq(tasks.id, row.id))
      .run();
    const updated = getTask(row.id);
    if (updated) logStatusEvent(updated, row.status);
    return updated ? toDto(updated) : reply.code(404).send({ error: 'task not found' });
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/retry', async (req, reply) => {
    const row = getTask(req.params.id);
    if (!row) return reply.code(404).send({ error: 'task not found' });
    if (row.status !== 'failed') {
      return reply
        .code(409)
        .send({ error: `only a failed task can be retried (current status: '${row.status}')` });
    }
    db.update(tasks)
      .set({ status: 'queued', errorLog: null })
      .where(eq(tasks.id, row.id))
      .run();
    const updated = getTask(row.id);
    if (updated) logStatusEvent(updated, row.status);
    return updated ? toDto(updated) : reply.code(404).send({ error: 'task not found' });
  });
}
