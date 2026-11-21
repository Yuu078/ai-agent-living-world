/**
 * SQLite persistence (better-sqlite3 + Drizzle).
 *
 * `initDb()` runs the CREATE TABLE IF NOT EXISTS DDL for the 6 core
 * tables (auto-migration on boot) and then seeds idempotently: the 6
 * resident agents and the default office furniture are inserted only
 * when their tables are empty, so restarts never duplicate or
 * overwrite operator data.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config.js';
import * as schema from './schema.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const sqlite = new Database(config.databasePath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

const DDL = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  avatar_config_json TEXT NOT NULL DEFAULT '{}',
  desk_pos_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'idle',
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  assigned_agent_id TEXT NOT NULL,
  parent_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  priority TEXT NOT NULL DEFAULT 'normal',
  result_artifact_id TEXT,
  error_log TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS world_objects (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT '',
  pos_x REAL NOT NULL DEFAULT 0,
  pos_y REAL NOT NULL DEFAULT 0,
  pos_z REAL NOT NULL DEFAULT 0,
  rot_y REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  participant_ids_json TEXT NOT NULL DEFAULT '[]',
  transcript_json TEXT NOT NULL DEFAULT '[]',
  action_items_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'scheduled'
);
`;

/* ------------------------------------------------------------------ */
/* Seed data                                                           */
/* ------------------------------------------------------------------ */

interface AgentSeed {
  id: string;
  name: string;
  role: string;
  department: string;
  model: string;
  systemPrompt: string;
  color: string;
  deskIndex: number;
  chair: { gx: number; gz: number };
}

// IDs, desks and chairs MUST match the client Phase 1 roster
// (client/src/engine/agents.ts + worldLayout.ts DESKS).
const AGENT_SEEDS: AgentSeed[] = [
  {
    id: 'agent-manager-1',
    name: 'Nova',
    role: 'Manager',
    department: 'Ops',
    model: 'demo/manager',
    systemPrompt:
      'You are Nova, the operations manager. Break goals into clear subtasks, assign them to the right specialists, and track progress.',
    color: '#ffb05c',
    deskIndex: 0,
    chair: { gx: 9, gz: 15 },
  },
  {
    id: 'agent-programmer-1',
    name: 'Kai',
    role: 'Programmer',
    department: 'Engineering',
    model: 'demo/coder',
    systemPrompt:
      'You are Kai, a senior programmer. Write clean, typed, well-tested code and explain your implementation choices briefly.',
    color: '#6ee7a0',
    deskIndex: 1,
    chair: { gx: 14, gz: 15 },
  },
  {
    id: 'agent-programmer-2',
    name: 'Rin',
    role: 'Programmer',
    department: 'Engineering',
    model: 'demo/coder',
    systemPrompt:
      'You are Rin, a programmer focused on APIs and integrations. Write clean, typed, well-tested code and flag edge cases early.',
    color: '#7dd3fc',
    deskIndex: 2,
    chair: { gx: 19, gz: 15 },
  },
  {
    id: 'agent-designer-1',
    name: 'Mika',
    role: 'Designer',
    department: 'Design',
    model: 'demo/designer',
    systemPrompt:
      'You are Mika, a product designer. Produce warm, usable interface designs with clear visual hierarchy and rationale.',
    color: '#f9a8d4',
    deskIndex: 3,
    chair: { gx: 9, gz: 19 },
  },
  {
    id: 'agent-researcher-1',
    name: 'Sora',
    role: 'Researcher',
    department: 'Research',
    model: 'demo/researcher',
    systemPrompt:
      'You are Sora, a researcher. Gather reliable sources, compare options, and summarise findings with citations.',
    color: '#c4b5fd',
    deskIndex: 4,
    chair: { gx: 14, gz: 19 },
  },
  {
    id: 'agent-qa-1',
    name: 'Bimo',
    role: 'QA Engineer',
    department: 'Engineering',
    model: 'demo/qa',
    systemPrompt:
      'You are Bimo, a QA engineer. Verify behaviour against the spec, hunt for regressions, and report defects with reproduction steps.',
    color: '#fca5a5',
    deskIndex: 5,
    chair: { gx: 19, gz: 19 },
  },
];

interface WorldObjectSeed {
  id: string;
  type: string;
  room: string;
  gx: number;
  gz: number;
  metadata: Record<string, unknown>;
}

// Footprints mirror client/src/engine/worldLayout.ts so the persisted
// layout matches what the 3D scene renders and the A* grid collides with.
// pos_x / pos_z store the footprint's grid origin (gx / gz); pos_y = 0.
const DESK_GRIDS = [
  { gx: 9, gz: 14 },
  { gx: 14, gz: 14 },
  { gx: 19, gz: 14 },
  { gx: 9, gz: 18 },
  { gx: 14, gz: 18 },
  { gx: 19, gz: 18 },
] as const;

function buildWorldObjectSeeds(): WorldObjectSeed[] {
  const desks: WorldObjectSeed[] = DESK_GRIDS.map((g, i) => ({
    id: `world-desk-${i}`,
    type: 'desk',
    room: 'workspace',
    gx: g.gx,
    gz: g.gz,
    metadata: {
      deskIndex: i,
      footprint: { x0: g.gx, z0: g.gz, x1: g.gx + 1, z1: g.gz },
      chair: { gx: g.gx, gz: g.gz + 1 },
    },
  }));
  return [
    ...desks,
    {
      id: 'world-meeting-table',
      type: 'meeting_table',
      room: 'meeting_room',
      gx: 8,
      gz: 7,
      metadata: { footprint: { x0: 8, z0: 7, x1: 11, z1: 8 } },
    },
    {
      id: 'world-coffee-counter',
      type: 'coffee_counter',
      room: 'coffee_bar',
      gx: 21,
      gz: 6,
      metadata: { footprint: { x0: 21, z0: 6, x1: 26, z1: 6 } },
    },
    {
      id: 'world-reception-counter',
      type: 'reception_counter',
      room: 'reception',
      gx: 15,
      gz: 20,
      metadata: { footprint: { x0: 15, z0: 20, x1: 18, z1: 20 } },
    },
    {
      id: 'world-lounge-sofa',
      type: 'lounge_sofa',
      room: 'lounge',
      gx: 24,
      gz: 20,
      metadata: { footprint: { x0: 24, z0: 20, x1: 27, z1: 20 } },
    },
  ];
}

function seedAgents(): void {
  const existing = db.select({ id: schema.agents.id }).from(schema.agents).all();
  if (existing.length > 0) return;
  for (const seed of AGENT_SEEDS) {
    db.insert(schema.agents)
      .values({
        id: seed.id,
        name: seed.name,
        role: seed.role,
        department: seed.department,
        model: seed.model,
        systemPrompt: seed.systemPrompt,
        avatarConfigJson: JSON.stringify({ color: seed.color }),
        deskPosJson: JSON.stringify({
          deskIndex: seed.deskIndex,
          chair: seed.chair,
        }),
        status: 'idle',
        totalTokens: 0,
        totalCostUsd: 0,
      })
      .run();
  }
}

function seedWorldObjects(): void {
  const existing = db
    .select({ id: schema.worldObjects.id })
    .from(schema.worldObjects)
    .all();
  if (existing.length > 0) return;
  for (const seed of buildWorldObjectSeeds()) {
    db.insert(schema.worldObjects)
      .values({
        id: seed.id,
        type: seed.type,
        room: seed.room,
        posX: seed.gx,
        posY: 0,
        posZ: seed.gz,
        rotY: 0,
        metadataJson: JSON.stringify(seed.metadata),
      })
      .run();
  }
}

/** Create tables (if needed) and seed defaults. Call before listen. */
export function initDb(): void {
  sqlite.exec(DDL);
  seedAgents();
  seedWorldObjects();
}
