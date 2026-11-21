/**
 * Artifacts API — /api/artifacts (AGENTS.md Section 6, Phase 2).
 * Stores text artifacts (Markdown / code / summaries) produced by
 * agents; binary payloads are out of scope for Phase 2.
 */
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { artifacts } from '../db/schema.js';

type ArtifactRow = typeof artifacts.$inferSelect;

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toDto(row: ArtifactRow) {
  return {
    id: row.id,
    taskId: row.taskId,
    agentId: row.agentId,
    filename: row.filename,
    mimeType: row.mimeType,
    contentText: row.contentText,
    createdAt: row.createdAt,
  };
}

export default async function artifactsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { taskId?: string; agentId?: string } }>(
    '/api/artifacts',
    async (req) => {
      const conditions: SQL[] = [];
      if (typeof req.query.taskId === 'string' && req.query.taskId.length > 0) {
        conditions.push(eq(artifacts.taskId, req.query.taskId));
      }
      if (typeof req.query.agentId === 'string' && req.query.agentId.length > 0) {
        conditions.push(eq(artifacts.agentId, req.query.agentId));
      }
      const rows =
        conditions.length > 0
          ? db.select().from(artifacts).where(and(...conditions)).all()
          : db.select().from(artifacts).all();
      return rows.map(toDto);
    },
  );

  app.get<{ Params: { id: string } }>('/api/artifacts/:id', async (req, reply) => {
    const row = db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, req.params.id))
      .get();
    if (!row) return reply.code(404).send({ error: 'artifact not found' });
    return toDto(row);
  });

  app.post('/api/artifacts', async (req, reply) => {
    const body = asRecord(req.body);
    const details: string[] = [];
    if (!isNonEmptyString(body.filename)) details.push('filename is required (non-empty string)');
    if (!isNonEmptyString(body.mimeType)) details.push('mimeType is required (non-empty string)');
    if (typeof body.contentText !== 'string') details.push('contentText is required (string)');
    if (details.length > 0) {
      return reply.code(400).send({ error: 'invalid artifact payload', details });
    }

    const row: ArtifactRow = {
      id: `artifact_${randomBytes(4).toString('hex')}`,
      taskId: isNonEmptyString(body.taskId) ? body.taskId : null,
      agentId: isNonEmptyString(body.agentId) ? body.agentId : null,
      filename: body.filename as string,
      mimeType: body.mimeType as string,
      contentText: body.contentText as string,
      createdAt: Date.now(),
    };
    db.insert(artifacts).values(row).run();
    return reply.code(201).send(toDto(row));
  });
}
