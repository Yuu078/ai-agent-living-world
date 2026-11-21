/**
 * Simulation — the DEMO_MODE runtime engine (Phase 1).
 *
 * Owns the mutable per-agent runtime state (position, path, timers) outside
 * of React so the 60fps render loop never triggers re-renders. Movement
 * follows A* waypoint lists cell-center to cell-center (4-directional), so
 * avatars physically cannot cross walls or furniture (Hard Rule 3).
 * Behaviour comes from lifeSim.ts — no LLM calls exist in Phase 1.
 */
import type {
  AgentProfile,
  AgentState,
  GridPoint,
  TargetZone,
  WorldEvent,
} from '@living-world/shared';
import { AGENT_PROFILES } from './agents';
import {
  buildGridMap,
  gridToWorld,
  COFFEE_STANDS,
  DESKS,
  GARDEN_SPOTS,
  LOUNGE_SEATS,
  MEETING_SEATS,
  RECEPTION_SPOT,
  type Seat,
} from './worldLayout';
import { findPath } from './pathfinding';
import { pickNextGoal, type LifeGoal } from './lifeSim';

export interface AgentView {
  state: AgentState;
  zone: TargetZone;
  thoughtBubble?: string;
}

export interface AgentRuntime {
  profile: AgentProfile;
  /** World-space position (floats, mutated every frame). */
  x: number;
  z: number;
  /** Current rotation Y (radians). */
  facing: number;
  state: AgentState;
  zone: TargetZone;
  thoughtBubble?: string;
  /** Remaining A* waypoints (grid cells). */
  path: GridPoint[];
  /** Cell the agent is heading to / occupying. */
  targetCell: GridPoint;
  goalFacing: number;
  stayTimer: number;
  /** Accumulated walked distance — drives the limb swing cycle. */
  walkPhase: number;
  /** 0..1 — how fast the agent is moving right now (animation blending). */
  moveBlend: number;
  /** True while an external/server event controls this agent (Phase 2). */
  controlled: boolean;
}

const WALK_SPEED = 2.6; // cells per second
const TURN_SPEED = 10; // radians per second (smoothed facing)

function angleLerp(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

const cellKey = (c: GridPoint) => `${c.gx},${c.gz}`;

export class Simulation {
  readonly grid = buildGridMap();
  readonly agents: AgentRuntime[] = [];
  /** UI mirror callback — fired only when display state changes. */
  onViewChange: ((agentId: string, view: AgentView) => void) | null = null;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
    AGENT_PROFILES.forEach((profile, i) => {
      const chair = DESKS[profile.deskIndex]!.chair;
      const w = gridToWorld(chair.gx, chair.gz);
      this.agents.push({
        profile,
        x: w.x,
        z: w.z,
        facing: DESKS[profile.deskIndex]!.facing,
        state: 'typing',
        zone: 'desk',
        thoughtBubble: undefined,
        path: [],
        targetCell: chair,
        goalFacing: DESKS[profile.deskIndex]!.facing,
        // Stagger first decisions so the office doesn't move in lockstep.
        stayTimer: 2 + i * 1.7 + rng() * 3,
        walkPhase: 0,
        moveBlend: 0,
        controlled: false,
      });
    });
  }

  getAgent(id: string): AgentRuntime | undefined {
    return this.agents.find((a) => a.profile.id === id);
  }

  isControlled(id: string): boolean {
    return this.getAgent(id)?.controlled ?? false;
  }

  /** First seat not targeted by another agent; falls back to the first seat. */
  private pickFreeSeat(a: AgentRuntime, seats: readonly Seat[]): Seat {
    const claimed = new Set(
      this.agents.filter((o) => o !== a).map((o) => cellKey(o.targetCell)),
    );
    return seats.find((s) => !claimed.has(cellKey(s.cell))) ?? seats[0]!;
  }

  /**
   * Apply an external/server WorldEvent (Phase 2, Visual Mapping Law).
   * Controlled agents are held by the event until an `idle` event releases
   * them back to lifeSim.
   */
  applyExternalEvent(ev: WorldEvent): void {
    const a = this.getAgent(ev.agentId);
    if (!a) return;

    if (ev.state === 'idle') {
      // Release control — lifeSim takes over via the normal depart() path.
      a.controlled = false;
      this.pendingArrival.delete(a.profile.id);
      a.path = [];
      this.setState(a, 'idle', undefined);
      a.thoughtBubble = undefined;
      a.stayTimer = 0.5;
      return;
    }

    if (ev.state === 'celebrating' || ev.state === 'error') {
      // No movement: cancel any path and play the state in place.
      a.controlled = true;
      this.pendingArrival.delete(a.profile.id);
      a.path = [];
      this.setState(a, ev.state, ev.thoughtBubble);
      return;
    }

    a.controlled = true;

    const desk = DESKS[a.profile.deskIndex]!;
    let dest: GridPoint;
    let facing: number;
    let zone: TargetZone;
    let arriveState: AgentState;

    switch (ev.state) {
      case 'typing':
      case 'tool_calling':
      case 'thinking': {
        dest = desk.chair;
        facing = desk.facing;
        zone = 'desk';
        arriveState = ev.state;
        break;
      }
      case 'meeting': {
        const seat = this.pickFreeSeat(a, MEETING_SEATS);
        dest = seat.cell;
        facing = seat.facing;
        zone = 'meeting_room';
        arriveState = 'meeting';
        break;
      }
      case 'coffee_break': {
        const seat = this.pickFreeSeat(a, COFFEE_STANDS);
        dest = seat.cell;
        facing = seat.facing;
        zone = 'coffee_bar';
        arriveState = 'coffee_break';
        break;
      }
      case 'sitting': {
        if (ev.targetZone === 'lounge') {
          const seat = this.pickFreeSeat(a, LOUNGE_SEATS);
          dest = seat.cell;
          facing = seat.facing;
          zone = 'lounge';
        } else {
          dest = desk.chair;
          facing = desk.facing;
          zone = 'desk';
        }
        arriveState = 'sitting';
        break;
      }
      case 'walking': {
        zone = ev.targetZone;
        arriveState = 'idle';
        switch (ev.targetZone) {
          case 'desk':
            dest = desk.chair;
            facing = desk.facing;
            break;
          case 'meeting_room': {
            const seat = this.pickFreeSeat(a, MEETING_SEATS);
            dest = seat.cell;
            facing = seat.facing;
            break;
          }
          case 'coffee_bar': {
            const seat = this.pickFreeSeat(a, COFFEE_STANDS);
            dest = seat.cell;
            facing = seat.facing;
            break;
          }
          case 'lounge': {
            const seat = this.pickFreeSeat(a, LOUNGE_SEATS);
            dest = seat.cell;
            facing = seat.facing;
            break;
          }
          case 'reception':
            dest = RECEPTION_SPOT.cell;
            facing = RECEPTION_SPOT.facing;
            break;
          case 'garden':
            dest = GARDEN_SPOTS[0]!;
            facing = a.goalFacing;
            break;
          default:
            dest = desk.chair;
            facing = desk.facing;
            break;
        }
        break;
      }
      default:
        return;
    }

    // Legal A* path from the current position (see task spec for the
    // mid-walk retarget rule: continue to the next waypoint first).
    let waypoints: GridPoint[];
    if (a.path.length > 0) {
      const from = a.path[0]!;
      const seg = findPath(this.grid, from, dest);
      waypoints = seg ? [from, ...seg.slice(1)] : [from];
    } else {
      const from = a.targetCell;
      const seg = findPath(this.grid, from, dest);
      waypoints = seg ? seg.slice(1) : [];
    }

    a.zone = zone;
    a.targetCell = dest;
    a.goalFacing = facing;
    this.pendingArrival.set(a.profile.id, {
      zone,
      cell: dest,
      facing,
      arriveState,
      staySeconds: Number.POSITIVE_INFINITY,
      thoughtBubble: ev.thoughtBubble,
    });

    if (waypoints.length === 0) {
      // Already at the destination (or it is unreachable): arrive now.
      this.pendingArrival.delete(a.profile.id);
      a.path = [];
      a.stayTimer = Number.POSITIVE_INFINITY;
      this.setState(a, arriveState, ev.thoughtBubble);
      this.emitView(a);
      return;
    }

    a.path = waypoints;
    this.setState(a, 'walking', undefined);
    this.emitView(a);
  }

  private emitView(a: AgentRuntime) {
    this.onViewChange?.(a.profile.id, {
      state: a.state,
      zone: a.zone,
      thoughtBubble: a.thoughtBubble,
    });
  }

  private setState(a: AgentRuntime, state: AgentState, bubble?: string) {
    if (a.state !== state || a.thoughtBubble !== bubble) {
      a.state = state;
      a.thoughtBubble = bubble;
      this.emitView(a);
    }
  }

  private chooseGoal(a: AgentRuntime): LifeGoal {
    // Avoid two agents claiming the same seat cell.
    const claimed = new Set(
      this.agents.filter((o) => o !== a).map((o) => cellKey(o.targetCell)),
    );
    let goal = pickNextGoal(a.profile.deskIndex, this.rng, a.zone);
    for (let attempt = 0; attempt < 3 && claimed.has(cellKey(goal.cell)); attempt++) {
      goal = pickNextGoal(a.profile.deskIndex, this.rng, a.zone);
    }
    if (claimed.has(cellKey(goal.cell))) {
      const desk = DESKS[a.profile.deskIndex]!;
      goal = {
        zone: 'desk',
        cell: desk.chair,
        facing: desk.facing,
        arriveState: 'typing',
        staySeconds: 6,
      };
    }
    return goal;
  }

  private depart(a: AgentRuntime) {
    const goal = this.chooseGoal(a);
    const from = a.targetCell;
    const path = findPath(this.grid, from, goal.cell);
    a.zone = goal.zone;
    a.goalFacing = goal.facing;
    if (!path || path.length <= 1) {
      // Already there (or unreachable — stay put with the new behaviour).
      a.targetCell = goal.cell;
      a.stayTimer = goal.staySeconds;
      this.setState(a, goal.arriveState, goal.thoughtBubble);
      this.emitView(a);
      return;
    }
    a.path = path.slice(1); // first node is the current cell
    a.targetCell = goal.cell;
    a.stayTimer = goal.staySeconds;
    a.thoughtBubble = undefined;
    this.setState(a, 'walking', undefined);
    this.emitView(a);
    // Stash the arrival behaviour on the runtime via a side map keyed by agent id.
    this.pendingArrival.set(a.profile.id, goal);
  }

  private pendingArrival = new Map<string, LifeGoal>();

  /** Advance the whole world. `dtSeconds` is real frame delta; `speed` is 1|2|4. */
  update(dtSeconds: number, speed: number) {
    const dt = Math.min(dtSeconds, 0.05) * speed;
    for (const a of this.agents) {
      if (a.state === 'walking') {
        this.updateWalking(a, dt);
      } else {
        a.moveBlend = Math.max(0, a.moveBlend - dt * 6);
        a.facing = angleLerp(a.facing, a.goalFacing, TURN_SPEED * dt);
        if (a.controlled) {
          // Held by an external event: never hand off to lifeSim.
          a.stayTimer -= dt;
          if (a.stayTimer <= 0) a.stayTimer = Number.POSITIVE_INFINITY;
        } else {
          a.stayTimer -= dt;
          if (a.stayTimer <= 0) this.depart(a);
        }
      }
    }
  }

  private updateWalking(a: AgentRuntime, dt: number) {
    const next = a.path[0];
    if (!next) {
      this.arrive(a);
      return;
    }
    const target = gridToWorld(next.gx, next.gz);
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    a.moveBlend = Math.min(1, a.moveBlend + dt * 6);
    if (dist > 0.0001) {
      a.facing = angleLerp(a.facing, Math.atan2(dx, dz), TURN_SPEED * dt);
    }
    if (dist <= step) {
      a.x = target.x;
      a.z = target.z;
      a.walkPhase += dist;
      a.path.shift();
      if (a.path.length === 0) this.arrive(a);
    } else {
      a.x += (dx / dist) * step;
      a.z += (dz / dist) * step;
      a.walkPhase += step;
    }
  }

  private arrive(a: AgentRuntime) {
    const goal = this.pendingArrival.get(a.profile.id);
    this.pendingArrival.delete(a.profile.id);
    const w = gridToWorld(a.targetCell.gx, a.targetCell.gz);
    a.x = w.x;
    a.z = w.z;
    if (goal) {
      a.goalFacing = goal.facing;
      a.stayTimer = goal.staySeconds;
      this.setState(a, goal.arriveState, goal.thoughtBubble);
    } else {
      this.setState(a, 'idle', undefined);
      a.stayTimer = 3;
    }
    this.emitView(a);
  }
}

/** Singleton used by the render loop and avatars. */
export const simulation = new Simulation();
