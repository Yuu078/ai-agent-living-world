/**
 * Shared DTOs for AI Agent Living World.
 * Single source of truth for the real-time event contract (Spec Section 5),
 * used by the client (Phase 1 demo simulation), the server (Phase 2+),
 * and external agents via the telemetry bridge (Phase 2+).
 */

/** Every visual state an avatar can be in (Spec Section 5 + Phase 1 `sitting`). */
export type AgentState =
  | 'idle'
  | 'walking'
  | 'sitting'
  | 'thinking'
  | 'typing'
  | 'tool_calling'
  | 'meeting'
  | 'celebrating'
  | 'error'
  | 'coffee_break';

export const AGENT_STATES: readonly AgentState[] = [
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
] as const;

/** Zones an agent can be sent to / occupy. `lab` + `executive` are Floor 2 (Phase 4). */
export type TargetZone =
  | 'desk'
  | 'meeting_room'
  | 'coffee_bar'
  | 'lounge'
  | 'reception'
  | 'garden'
  | 'lab'
  | 'executive';

export const TARGET_ZONES: readonly TargetZone[] = [
  'desk',
  'meeting_room',
  'coffee_bar',
  'lounge',
  'reception',
  'garden',
  'lab',
  'executive',
] as const;

export type EventSource = 'internal' | 'external_webhook';

/**
 * The exact Socket.IO `agent:state_change` payload (Spec Section 5).
 * Both the internal orchestrator and external agents (POST /api/telemetry)
 * emit this shape.
 */
export interface WorldEvent {
  agentId: string;
  source: EventSource;
  state: AgentState;
  targetZone: TargetZone;
  thoughtBubble?: string;
  taskId?: string;
  tokensUsed?: number;
  costUsd?: number;
  /** Epoch milliseconds. */
  timestamp: number;
}

export const AGENT_STATE_CHANGE_EVENT = 'agent:state_change' as const;

/** Task lifecycle states (Spec Section 4, `tasks.status`). */
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed';

export interface TaskPayload {
  id: string;
  title: string;
  prompt: string;
  assignedAgentId: string;
  parentTaskId?: string | null;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  resultArtifactId?: string | null;
  errorLog?: string | null;
  createdAt: number;
}

/** Static profile of an agent (mirrors the `agents` table, Spec Section 4). */
export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  department: string;
  model: string;
  color: string;
  deskIndex: number;
}

/** Integer grid coordinate used by the A* pathfinding engine. */
export interface GridPoint {
  gx: number;
  gz: number;
}

/**
 * 2D navigation grid. `blocked` is row-major: index = gz * width + gx.
 * `1` = obstacle (wall / furniture footprint), `0` = walkable.
 */
export interface GridMap {
  width: number;
  height: number;
  cellSize: number;
  blocked: Uint8Array;
}

/* ------------------------------------------------------------------ */
/* Phase 3 DTOs — LLM orchestrator, artifacts, meetings, chat, stats   */
/* ------------------------------------------------------------------ */

/** A stored text artifact produced by an agent (Spec Section 4). */
export interface ArtifactPayload {
  id: string;
  taskId: string | null;
  agentId: string | null;
  filename: string;
  mimeType: string;
  contentText: string;
  createdAt: number;
}

export type MeetingStatus = 'scheduled' | 'running' | 'completed' | 'failed';

export interface MeetingTurn {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
}

export interface MeetingPayload {
  id: string;
  topic: string;
  participantIds: string[];
  transcript: MeetingTurn[];
  actionItems: string[];
  status: MeetingStatus;
}

export interface ChatMessagePayload {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/** Aggregated token / cost totals, summed from the `agents` table. */
export interface WorldStats {
  totalTokens: number;
  totalCostUsd: number;
  perAgent: Array<{
    agentId: string;
    totalTokens: number;
    totalCostUsd: number;
  }>;
}

export type AppMode = 'DEMO_MODE' | 'LIVE_MODE';

export type CameraPreset = 'isometric' | 'orbit' | 'top' | 'follow';

/* ------------------------------------------------------------------ */
/* Phase 4 DTOs — Build Mode, multi-floor, performance                 */
/* ------------------------------------------------------------------ */

/** The two building floors. Floor 2 (Executive & R&D Lab) stacks on Floor 1. */
export type FloorId = 1 | 2;

/**
 * A persisted world object — mirrors one `world_objects` row as returned
 * by `GET /api/world` (Spec Section 4). For Build Mode placements,
 * `posX` / `posZ` hold the footprint's grid origin (gx / gz), `posY`
 * holds the render height of the object's floor, and `metadata` carries
 * `{ userPlaced: true, floor, furnitureType, footprint }`.
 */
export interface WorldObjectPayload {
  id: string;
  type: string;
  room: string;
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  metadata: Record<string, unknown>;
}

/** Socket.IO event broadcast by the server after any world-object change. */
export const WORLD_OBJECTS_CHANGED_EVENT = 'world:objects_changed' as const;

/** Furniture kinds the Build Mode palette can place. */
export type FurnitureType =
  | 'desk'
  | 'table'
  | 'plant'
  | 'bookshelf'
  | 'sofa'
  | 'whiteboard';

export const FURNITURE_TYPES: readonly FurnitureType[] = [
  'desk',
  'table',
  'plant',
  'bookshelf',
  'sofa',
  'whiteboard',
] as const;

/** Rendering quality presets (Phase 4 performance). */
export type QualityPreset = 'low' | 'medium' | 'high' | 'auto';
