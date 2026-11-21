/**
 * Agents CRUD — /api/agents (AGENTS.md Section 6, Phase 2).
 * Rows are stored snake_case in SQLite and exposed as camelCase DTOs
 * with `avatarConfig` / `deskPos` as parsed JSON objects.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { agents } from '../db/schema.js';

// Mirror of AGENT_STATES in shared/types.ts (server imports types only).
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

type AgentRow = typeof agents.$inferSelect;

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toDto(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    model: row.model,
    systemPrompt: row.systemPrompt,
    avatarConfig: parseJsonObject(row.avatarConfigJson),
    deskPos: parseJsonObject(row.deskPosJson),
    status: row.status,
    totalTokens: row.totalTokens,
    totalCostUsd: row.totalCostUsd,
  };
}

function getAgent(id: string): AgentRow | undefined {
  return db.select().from(agents).where(eq(agents.id, id)).get();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export default async function agentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => {
    const rows = db.select().from(agents).all();
    return rows.map(toDto);
  });

  app.get<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const row = getAgent(req.params.id);
    if (!row) return reply.code(404).send({ error: 'agent not found' });
    return toDto(row);
  });

  app.post('/api/agents', async (req, reply) => {
    const body = asRecord(req.body);
    const details: string[] = [];
    if (!isNonEmptyString(body.name)) details.push('name is required (non-empty string)');
    if (!isNonEmptyString(body.role)) details.push('role is required (non-empty string)');
    if (details.length > 0) {
      return reply.code(400).send({ error: 'invalid agent payload', details });
    }

    const id = isNonEmptyString(body.id)
      ? body.id
      : `agent_${randomBytes(4).toString('hex')}`;
    if (getAgent(id)) {
      return reply.code(409).send({ error: 'agent id already exists' });
    }

    // avatarConfig: explicit object wins; a bare `color` string is a
    // convenience shorthand used by the client roster.
    let avatarConfig: Record<string, unknown> = {};
    if (body.avatarConfig !== null && typeof body.avatarConfig === 'object' && !Array.isArray(body.avatarConfig)) {
      avatarConfig = body.avatarConfig as Record<string, unknown>;
    } else if (typeof body.color === 'string') {
      avatarConfig = { color: body.color };
    }
    const deskPos =
      body.deskPos !== null && typeof body.deskPos === 'object' && !Array.isArray(body.deskPos)
        ? (body.deskPos as Record<string, unknown>)
        : {};

    const row: AgentRow = {
      id,
      name: body.name as string,
      role: body.role as string,
      department: typeof body.department === 'string' ? body.department : '',
      model: typeof body.model === 'string' ? body.model : '',
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : '',
      avatarConfigJson: JSON.stringify(avatarConfig),
      deskPosJson: JSON.stringify(deskPos),
      status: 'idle',
      totalTokens: 0,
      totalCostUsd: 0,
    };
    db.insert(agents).values(row).run();
    return reply.code(201).send(toDto(row));
  });

  app.put<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const existing = getAgent(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'agent not found' });

    const body = asRecord(req.body);
    const updates: Partial<AgentRow> = {};
    const details: string[] = [];

    const stringFields = ['name', 'role', 'department', 'model', 'systemPrompt'] as const;
    for (const field of stringFields) {
      const value = body[field];
      if (value === undefined) continue;
      if (typeof value !== 'string') {
        details.push(`${field} must be a string`);
        continue;
      }
      if ((field === 'name' || field === 'role') && value.trim().length === 0) {
        details.push(`${field} must not be empty`);
        continue;
      }
      updates[field] = value;
    }
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !AGENT_STATES.includes(body.status)) {
        details.push(`status must be one of: ${AGENT_STATES.join(', ')}`);
      } else {
        updates.status = body.status;
      }
    }
    if (details.length > 0) {
      return reply.code(400).send({ error: 'invalid agent update', details });
    }
    if (Object.keys(updates).length === 0) {
      return reply
        .code(400)
        .send({ error: 'no editable fields provided', details: ['expected at least one of: name, role, department, model, systemPrompt, status'] });
    }

    db.update(agents).set(updates).where(eq(agents.id, req.params.id)).run();
    const updated = getAgent(req.params.id);
    return updated ? toDto(updated) : reply.code(404).send({ error: 'agent not found' });
  });

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const existing = getAgent(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'agent not found' });
    db.delete(agents).where(eq(agents.id, req.params.id)).run();
    return { ok: true, id: req.params.id };
  });
}
