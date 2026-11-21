/**
 * Drizzle SQLite schema — the 6 core tables (AGENTS.md Section 4).
 * Column names and defaults here are the persistence contract; the API
 * layer maps rows to camelCase DTOs from `@living-world/shared`.
 */
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  department: text('department').notNull().default(''),
  model: text('model').notNull().default(''),
  systemPrompt: text('system_prompt').notNull().default(''),
  avatarConfigJson: text('avatar_config_json').notNull().default('{}'),
  deskPosJson: text('desk_pos_json').notNull().default('{}'),
  status: text('status').notNull().default('idle'),
  totalTokens: integer('total_tokens').notNull().default(0),
  totalCostUsd: real('total_cost_usd').notNull().default(0),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  assignedAgentId: text('assigned_agent_id').notNull(),
  parentTaskId: text('parent_task_id'),
  status: text('status').notNull().default('queued'),
  priority: text('priority').notNull().default('normal'),
  resultArtifactId: text('result_artifact_id'),
  errorLog: text('error_log'),
  createdAt: integer('created_at').notNull(),
});

export const taskEvents = sqliteTable('task_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id'),
  agentId: text('agent_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  taskId: text('task_id'),
  agentId: text('agent_id'),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  contentText: text('content_text').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const worldObjects = sqliteTable('world_objects', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  room: text('room').notNull().default(''),
  posX: real('pos_x').notNull().default(0),
  posY: real('pos_y').notNull().default(0),
  posZ: real('pos_z').notNull().default(0),
  rotY: real('rot_y').notNull().default(0),
  metadataJson: text('metadata_json').notNull().default('{}'),
});

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  participantIdsJson: text('participant_ids_json').notNull().default('[]'),
  transcriptJson: text('transcript_json').notNull().default('[]'),
  actionItemsJson: text('action_items_json').notNull().default('[]'),
  status: text('status').notNull().default('scheduled'),
});
