/**
 * World layout API — /api/world (AGENTS.md Section 6, Phase 2).
 * Loads and persists furniture / room objects in `world_objects`.
 * Build Mode editing on the client is Phase 4; this is its backend.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { worldObjects } from '../db/schema.js';
import { emitWorldObjectsChanged } from '../realtime.js';

type WorldObjectRow = typeof worldObjects.$inferSelect;

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

function toDto(row: WorldObjectRow) {
  return {
    id: row.id,
    type: row.type,
    room: row.room,
    posX: row.posX,
    posY: row.posY,
    posZ: row.posZ,
    rotY: row.rotY,
    metadata: parseJsonObject(row.metadataJson),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export default async function worldRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/world', async () => {
    const rows = db.select().from(worldObjects).all();
    return { objects: rows.map(toDto) };
  });

  app.post('/api/world', async (req, reply) => {
    const body = asRecord(req.body);
    if (!Array.isArray(body.objects)) {
      return reply
        .code(400)
        .send({ error: 'invalid world payload', details: ['objects must be an array'] });
    }

    const details: string[] = [];
    const rows: WorldObjectRow[] = [];
    body.objects.forEach((entry, index) => {
      const obj = asRecord(entry);
      if (!isNonEmptyString(obj.id)) {
        details.push(`objects[${index}].id is required (non-empty string)`);
        return;
      }
      for (const field of ['posX', 'posY', 'posZ', 'rotY'] as const) {
        if (obj[field] !== undefined && !isFiniteNumber(obj[field])) {
          details.push(`objects[${index}].${field} must be a finite number`);
          return;
        }
      }
      if (
        obj.metadata !== undefined &&
        (obj.metadata === null || typeof obj.metadata !== 'object' || Array.isArray(obj.metadata))
      ) {
        details.push(`objects[${index}].metadata must be an object`);
        return;
      }
      rows.push({
        id: obj.id,
        type: isNonEmptyString(obj.type) ? obj.type : 'object',
        room: typeof obj.room === 'string' ? obj.room : '',
        posX: isFiniteNumber(obj.posX) ? obj.posX : 0,
        posY: isFiniteNumber(obj.posY) ? obj.posY : 0,
        posZ: isFiniteNumber(obj.posZ) ? obj.posZ : 0,
        rotY: isFiniteNumber(obj.rotY) ? obj.rotY : 0,
        metadataJson: JSON.stringify(
          obj.metadata !== undefined ? (obj.metadata as Record<string, unknown>) : {},
        ),
      });
    });
    if (details.length > 0) {
      return reply.code(400).send({ error: 'invalid world payload', details });
    }

    for (const row of rows) {
      db.insert(worldObjects)
        .values(row)
        .onConflictDoUpdate({
          target: worldObjects.id,
          set: {
            type: row.type,
            room: row.room,
            posX: row.posX,
            posY: row.posY,
            posZ: row.posZ,
            rotY: row.rotY,
            metadataJson: row.metadataJson,
          },
        })
        .run();
    }
    const allRows = db.select().from(worldObjects).all();
    emitWorldObjectsChanged(allRows.map(toDto));
    return { saved: rows.length };
  });

  app.delete<{ Params: { id: string } }>('/api/world/:id', async (req, reply) => {
    const existing = db
      .select({ id: worldObjects.id })
      .from(worldObjects)
      .where(eq(worldObjects.id, req.params.id))
      .get();
    if (!existing) return reply.code(404).send({ error: 'world object not found' });
    db.delete(worldObjects).where(eq(worldObjects.id, req.params.id)).run();
    const allRows = db.select().from(worldObjects).all();
    emitWorldObjectsChanged(allRows.map(toDto));
    return { ok: true, id: req.params.id };
  });
}
