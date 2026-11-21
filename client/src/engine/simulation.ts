/**
 * Client-side movement + life simulation (Spec Sections 6 & 7).
 *
 * Owns the floating-point position of every agent and walks them along
 * A* waypoint paths at a fixed speed. Demo Mode (the default) drives
 * agents with the local life simulator; when LIVE events arrive over
 * Socket.IO, `applyExternalEvent` takes control of that agent
 * (Spec Section 7: external events always override Demo Mode for that
 * agent) and releases it back to the life simulator when the event goes
 * idle.
 *
 * Phase 4 additions:
 * - Multi-floor: each agent has a `floor`; goals on the other floor are
 *   routed via the elevator (path to the entry cell -> ride -> path on
 *   the destination floor), all on the same zero-clipping A* grids.
 * - Dynamic obstacles: Build Mode placements rebuild the per-floor grids
 *   (`setDynamicObjects`) and walking agents replan immediately.
 * - Crowd: up to 24 lightweight guest agents (instanced rendering) that
 *   wander the campus using the same pathfinding.
 */
import type {
  AgentProfile,
  AgentState,
  FloorId,
  GridMap,
  GridPoint,
  TargetZone,
  WorldEvent,
  WorldObjectPayload,
} from '@living-world/shared';
import { AGENT_PROFILES } from './agents';
import { findPath } from './pathfinding';
import {
  COFFEE_STANDS,
  DESKS,
  ELEVATOR_ENTRY,
  EXEC_SEATS,
  GARDEN_SPOTS,
  LAB_SEATS,
  LOUNGE_SEATS,
  MEETING_SEATS,
  RECEPTION_SPOT,
  buildGridMap,
  applyDynamicObstacles,
  cellKeyOf,
  gridToWorld,
  isWalkable,
  worldToGrid,
  facingToward,
  zoneFloor,
  type GridRect,
  type Seat,
} from './worldLayout';
import { pickNextGoal, type LifeGoal } from './lifeSim';

export const WALK_SPEED = 2.2; // world units / second
const RIDE_SECONDS = 1.4; // elevator ride duration
const ARRIVE_EPS = 0.02;

export interface AgentView {
  state: AgentState;
  zone: TargetZone;
  thoughtBubble: string | null;
  floor: FloorId;
}

export interface ElevatorRide {
  from: FloorId;
  to: FloorId;
  /** 0..1 progress of the ride. */
  t: number;
  duration: number;
}

export interface AgentRuntime {
  profile: AgentProfile;
  x: number;
  z: number;
  facing: number;
  state: AgentState;
  zone: TargetZone;
  thoughtBubble: string | null;
  /** The grid cell the agent is heading to (or standing on). */
  targetCell: GridPoint;
  path: GridPoint[];
  stayTimer: number;
  /** Set while a LIVE (server) event drives this agent. */
  controlled: boolean;
  /** Current floor (Phase 4). */
  floor: FloorId;
  /** Active elevator ride, if any. */
  ride: ElevatorRide | null;
  /** Crowd guests are lightweight wanderers (instanced rendering). */
  crowd: boolean;
  /** 0..1 walk-cycle blend used by the avatar's pose driver. */
  moveBlend: number;
  /** Accumulated walk-cycle phase (advances with distance walked). */
  walkPhase: number;
}

type Rng = () => number;

const CROWD_COLORS = [
  '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16',
  '#e879f9', '#facc15', '#34d399', '#fb7185', '#a3e635', '#fda4af',
];

function crowdProfile(index: number): AgentProfile {
  return {
    id: `crowd-${index}`,
    name: `Guest ${index + 1}`,
    role: 'Visitor',
    department: 'Guests',
    model: '',
    color: CROWD_COLORS[index % CROWD_COLORS.length]!,
    deskIndex: 0,
  };
}

/** Spawn spots for crowd guests (garden + entrance apron). */
const CROWD_SPAWNS: GridPoint[] = [
  ...GARDEN_SPOTS,
  { gx: 16, gz: 24 },
  { gx: 17, gz: 24 },
  { gx: 16, gz: 26 },
  { gx: 33, gz: 25 },
  { gx: 38, gz: 25 },
];

class Simulation {
  readonly agents: AgentRuntime[] = [];
  /** Base grids (static layout only), one per floor. */
  private readonly baseGrids: Record<FloorId, GridMap> = {
    1: buildGridMap(1),
    2: buildGridMap(2),
  };
  /** Live grids = base + Build Mode placements. */
  private floorGrids: Record<FloorId, GridMap> = {
    1: this.baseGrids[1],
    2: this.baseGrids[2],
  };
  /** Build Mode placements by id (for validation + rebuilds). */
  private dynamicById = new Map<string, { floor: FloorId; rect: GridRect }>();
  private crowd: AgentRuntime[] = [];
  private readonly pendingArrival = new Map<string, LifeGoal>();
  /** Final goal waiting on the other side of an elevator ride. */
  private readonly pendingJourney = new Map<string, LifeGoal>();
  private readonly rng: Rng = Math.random;
  onViewChange: ((agentId: string, view: AgentView) => void) | null = null;

  constructor() {
    AGENT_PROFILES.forEach((profile, i) => {
      const desk = DESKS[profile.deskIndex]!;
      const w = gridToWorld(desk.chair.gx, desk.chair.gz);
      this.agents.push({
        profile,
        x: w.x,
        z: w.z,
        facing: desk.facing,
        state: 'typing',
        zone: 'desk',
        thoughtBubble: null,
        targetCell: { ...desk.chair },
        path: [],
        // Stagger first departures so the office doesn't move in lockstep.
        stayTimer: 4 + i * 3.5 + this.rng() * 4,
        controlled: false,
        floor: 1,
        ride: null,
        crowd: false,
        moveBlend: 0,
        walkPhase: 0,
      });
    });
  }

  /* ---------------- grids & dynamic obstacles (Phase 4) ------------- */

  /** Floor-1 live grid (kept for compatibility with older callers). */
  get grid(): GridMap {
    return this.floorGrids[1];
  }

  gridFor(floor: FloorId): GridMap {
    return this.floorGrids[floor];
  }

  baseGridFor(floor: FloorId): GridMap {
    return this.baseGrids[floor];
  }

  /** Grid for `floor` with every placement EXCEPT `excludeId` applied —
   *  used to validate a moved/rotated object against the rest. */
  gridWithout(floor: FloorId, excludeId: string): GridMap {
    const rects: GridRect[] = [];
    for (const [id, entry] of this.dynamicById) {
      if (id !== excludeId && entry.floor === floor) rects.push(entry.rect);
    }
    return applyDynamicObstacles(this.baseGrids[floor], rects);
  }

  /** Cells currently occupied by agents (or reserved as their next
   *  waypoint) on a floor — Build Mode may not cover these. */
  agentCells(floor: FloorId): Set<string> {
    const set = new Set<string>();
    for (const a of this.allAgents()) {
      if (a.floor !== floor || a.ride) continue;
      set.add(cellKeyOf(a.targetCell));
      if (a.path.length > 0) set.add(cellKeyOf(a.path[0]!));
      const here = worldToGrid(a.x, a.z);
      if (here.gx >= 0 && here.gz >= 0) set.add(cellKeyOf(here));
    }
    return set;
  }

  /**
   * Replace the dynamic-obstacle set from the persisted world objects
   * (only `metadata.userPlaced === true` entries count), rebuild both
   * floor grids, and replan every walking agent on the new grids.
   */
  setDynamicObjects(objects: readonly WorldObjectPayload[]): void {
    this.dynamicById.clear();
    for (const o of objects) {
      const md = o.metadata ?? {};
      if (md.userPlaced !== true) continue;
      const floor: FloorId = md.floor === 2 ? 2 : 1;
      const fp = md.footprint as Partial<GridRect> | undefined;
      if (
        !fp ||
        ![fp.x0, fp.z0, fp.x1, fp.z1].every(
          (v) => typeof v === 'number' && Number.isFinite(v),
        )
      ) {
        continue;
      }
      this.dynamicById.set(o.id, {
        floor,
        rect: { x0: fp.x0!, z0: fp.z0!, x1: fp.x1!, z1: fp.z1! },
      });
    }
    const rects: Record<FloorId, GridRect[]> = { 1: [], 2: [] };
    for (const entry of this.dynamicById.values()) {
      rects[entry.floor].push(entry.rect);
    }
    this.floorGrids = {
      1: applyDynamicObstacles(this.baseGrids[1], rects[1]),
      2: applyDynamicObstacles(this.baseGrids[2], rects[2]),
    };
    this.replanAfterGridChange();
  }

  /** After a grid rebuild, walking agents replan from their next
   *  waypoint; an agent whose destination became unreachable stops at
   *  its next waypoint instead of clipping into the new obstacle. */
  private replanAfterGridChange(): void {
    for (const a of this.allAgents()) {
      if (a.ride || a.path.length === 0) continue;
      const grid = this.floorGrids[a.floor];
      const next = a.path[0]!;
      const destOk = isWalkable(grid, a.targetCell.gx, a.targetCell.gz);
      const seg = destOk ? findPath(grid, next, a.targetCell) : null;
      if (seg) {
        a.path = [next, ...seg.slice(1)];
        continue;
      }
      // Destination gone or unreachable: stop at the next waypoint if it
      // is still walkable, otherwise at the nearest walkable cell.
      this.pendingArrival.delete(a.profile.id);
      this.pendingJourney.delete(a.profile.id);
      if (isWalkable(grid, next.gx, next.gz)) {
        a.targetCell = { ...next };
        a.path = [next];
      } else {
        const safe = this.nearestWalkable(grid, worldToGrid(a.x, a.z));
        a.targetCell = safe;
        a.path = [{ ...safe }];
      }
    }
  }

  private nearestWalkable(grid: GridMap, from: GridPoint): GridPoint {
    if (isWalkable(grid, from.gx, from.gz)) return { ...from };
    for (let r = 1; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const c = { gx: from.gx + dx, gz: from.gz + dz };
          if (isWalkable(grid, c.gx, c.gz)) return c;
        }
      }
    }
    return { ...ELEVATOR_ENTRY };
  }

  /* ------------------------------ crowd ----------------------------- */

  allAgents(): AgentRuntime[] {
    return [...this.agents, ...this.crowd];
  }

  crowdAgents(): readonly AgentRuntime[] {
    return this.crowd;
  }

  crowdCount(): number {
    return this.crowd.length;
  }

  setCrowdCount(n: number): void {
    const target = Math.max(0, Math.min(24, Math.floor(n)));
    while (this.crowd.length < target) {
      const i = this.crowd.length;
      const spawn = CROWD_SPAWNS[i % CROWD_SPAWNS.length]!;
      const w = gridToWorld(spawn.gx, spawn.gz);
      this.crowd.push({
        profile: crowdProfile(i),
        x: w.x,
        z: w.z,
        facing: this.rng() * Math.PI * 2,
        state: 'idle',
        zone: 'garden',
        thoughtBubble: null,
        targetCell: { ...spawn },
        path: [],
        stayTimer: 1 + i * 0.7,
        controlled: false,
        floor: 1,
        ride: null,
        crowd: true,
        moveBlend: 0,
        walkPhase: 0,
      });
    }
    if (this.crowd.length > target) this.crowd.length = target;
  }

  getAgent(id: string): AgentRuntime | undefined {
    return (
      this.agents.find((a) => a.profile.id === id) ??
      this.crowd.find((a) => a.profile.id === id)
    );
  }

  private emitView(a: AgentRuntime): void {
    this.onViewChange?.(a.profile.id, {
      state: a.state,
      zone: a.zone,
      thoughtBubble: a.thoughtBubble,
      floor: a.floor,
    });
  }

  private setState(a: AgentRuntime, state: AgentState, bubble: string | null): void {
    a.state = state;
    a.thoughtBubble = bubble;
    this.emitView(a);
  }

  /* --------------------------- routing ------------------------------ */

  /**
   * Compute waypoints from the agent's current motion state to `dest`
   * on the agent's CURRENT floor grid. Mid-walk, the agent always
   * finishes its current segment first (no diagonal cutting through
   * furniture). Returns [] when no movement is needed/possible.
   */
  private computeRoute(a: AgentRuntime, dest: GridPoint): GridPoint[] {
    const grid = this.floorGrids[a.floor];
    if (a.path.length > 0) {
      const from = a.path[0]!;
      const seg = findPath(grid, from, dest);
      return seg ? [from, ...seg.slice(1)] : [from];
    }
    const seg = findPath(grid, a.targetCell, dest);
    return seg ? seg.slice(1) : [];
  }

  /**
   * Send an agent toward a goal, routing through the elevator when the
   * goal is on the other floor. The arrival state/bubble come from the
   * goal once the agent actually gets there.
   */
  private routeTo(a: AgentRuntime, goal: LifeGoal): void {
    a.zone = goal.zone;
    if (goal.floor !== a.floor) {
      this.pendingJourney.set(a.profile.id, goal);
      const elevGoal: LifeGoal = {
        zone: goal.zone,
        floor: a.floor,
        cell: { ...ELEVATOR_ENTRY },
        facing: facingToward(ELEVATOR_ENTRY, { gx: 27, gz: 6 }),
        arriveState: 'walking',
        staySeconds: 0,
      };
      this.pendingArrival.set(a.profile.id, elevGoal);
      this.beginWalk(a, ELEVATOR_ENTRY);
      return;
    }
    this.pendingJourney.delete(a.profile.id);
    this.pendingArrival.set(a.profile.id, goal);
    this.beginWalk(a, goal.cell);
  }

  private beginWalk(a: AgentRuntime, dest: GridPoint): void {
    const waypoints = this.computeRoute(a, dest);
    a.targetCell = { ...dest };
    if (waypoints.length === 0) {
      a.path = [];
      this.arrive(a);
      return;
    }
    a.path = waypoints;
    this.setState(a, 'walking', a.thoughtBubble);
  }

  private arrive(a: AgentRuntime): void {
    const w = gridToWorld(a.targetCell.gx, a.targetCell.gz);
    a.x = w.x;
    a.z = w.z;
    a.path = [];
    // Elevator transfer point reached with a cross-floor goal pending?
    const journey = this.pendingJourney.get(a.profile.id);
    if (
      journey &&
      journey.floor !== a.floor &&
      a.targetCell.gx === ELEVATOR_ENTRY.gx &&
      a.targetCell.gz === ELEVATOR_ENTRY.gz
    ) {
      this.pendingArrival.delete(a.profile.id);
      a.ride = { from: a.floor, to: journey.floor, t: 0, duration: RIDE_SECONDS };
      this.setState(a, 'walking', 'Taking the elevator…');
      return;
    }
    const goal = this.pendingArrival.get(a.profile.id);
    this.pendingArrival.delete(a.profile.id);
    if (goal) {
      a.facing = goal.facing;
      a.stayTimer = goal.staySeconds;
      this.setState(a, goal.arriveState, goal.thoughtBubble ?? null);
    } else {
      a.stayTimer = 3;
      this.setState(a, 'idle', null);
    }
  }

  private finishRide(a: AgentRuntime): void {
    const ride = a.ride!;
    a.floor = ride.to;
    a.ride = null;
    a.targetCell = { ...ELEVATOR_ENTRY };
    const w = gridToWorld(ELEVATOR_ENTRY.gx, ELEVATOR_ENTRY.gz);
    a.x = w.x;
    a.z = w.z;
    this.emitView(a);
    const journey = this.pendingJourney.get(a.profile.id);
    this.pendingJourney.delete(a.profile.id);
    if (journey) {
      this.pendingArrival.set(a.profile.id, journey);
      this.beginWalk(a, journey.cell);
    } else {
      a.stayTimer = 2;
      this.setState(a, 'idle', null);
    }
  }

  /* ------------------------- LIVE events ---------------------------- */

  /**
   * Apply a server event (Spec Section 7 Visual Mapping Law). External
   * events take control of the agent until an `idle` event releases it
   * back to the life simulator.
   */
  applyExternalEvent(event: WorldEvent): void {
    const a = this.agents.find((x) => x.profile.id === event.agentId);
    if (!a) return;
    const desk = DESKS[a.profile.deskIndex]!;

    if (event.state === 'idle') {
      a.controlled = false;
      this.pendingArrival.delete(a.profile.id);
      this.pendingJourney.delete(a.profile.id);
      if (a.ride) {
        // Finish the ride instantly so control returns on a real floor.
        a.floor = a.ride.to;
        a.ride = null;
        a.targetCell = { ...ELEVATOR_ENTRY };
        const w = gridToWorld(ELEVATOR_ENTRY.gx, ELEVATOR_ENTRY.gz);
        a.x = w.x;
        a.z = w.z;
      }
      a.stayTimer = 1.5;
      this.setState(a, 'idle', null);
      return;
    }

    a.controlled = true;
    a.zone = event.targetZone;

    // In-place states: no movement.
    if (event.state === 'celebrating' || event.state === 'error') {
      a.path = [];
      this.pendingArrival.delete(a.profile.id);
      this.pendingJourney.delete(a.profile.id);
      a.stayTimer = Number.POSITIVE_INFINITY;
      this.setState(a, event.state, event.thoughtBubble ?? null);
      return;
    }

    let dest: GridPoint = desk.chair;
    let facing: number = desk.facing;
    let floor: FloorId = 1;

    if (event.state === 'meeting') {
      const seat = this.pickFreeSeat(MEETING_SEATS, a) ?? MEETING_SEATS[0]!;
      dest = seat.cell;
      facing = seat.facing;
    } else if (event.state === 'coffee_break') {
      const stand =
        this.pickFreeSeat(COFFEE_STANDS, a) ?? COFFEE_STANDS[0]!;
      dest = stand.cell;
      facing = stand.facing;
    } else if (event.state === 'walking' || event.state === 'sitting') {
      // Head to the zone named by the event (Phase 4: lab / executive
      // resolve to Floor 2 seats and route via the elevator).
      floor = zoneFloor(event.targetZone);
      const seat = this.seatForZone(event.targetZone, a);
      if (seat) {
        dest = seat.cell;
        facing = seat.facing;
      }
    }
    // typing / thinking / tool_calling -> own desk (already the default).

    const goal: LifeGoal = {
      zone: event.targetZone,
      floor,
      cell: dest,
      facing,
      arriveState: event.state,
      staySeconds: Number.POSITIVE_INFINITY,
      thoughtBubble: event.thoughtBubble,
    };
    this.routeTo(a, goal);
    // If the agent was already at the destination, arrive() has applied
    // the event state; otherwise it applies on arrival. Either way the
    // bubble shows immediately while walking.
    if (a.state === 'walking') {
      this.setState(a, 'walking', event.thoughtBubble ?? null);
    }
  }

  private seatForZone(zone: TargetZone, self: AgentRuntime): Seat | null {
    switch (zone) {
      case 'desk': {
        const d = DESKS[self.profile.deskIndex]!;
        return { cell: d.chair, facing: d.facing };
      }
      case 'meeting_room':
        return this.pickFreeSeat(MEETING_SEATS, self) ?? MEETING_SEATS[0]!;
      case 'coffee_bar':
        return this.pickFreeSeat(COFFEE_STANDS, self) ?? COFFEE_STANDS[0]!;
      case 'lounge':
        return this.pickFreeSeat(LOUNGE_SEATS, self) ?? LOUNGE_SEATS[0]!;
      case 'lab':
        return this.pickFreeSeat(LAB_SEATS, self) ?? LAB_SEATS[0]!;
      case 'executive':
        return this.pickFreeSeat(EXEC_SEATS, self) ?? EXEC_SEATS[0]!;
      case 'reception':
        return RECEPTION_SPOT;
      case 'garden':
        return null;
    }
  }

  /** First seat not targeted by another agent (falls back to null). */
  private pickFreeSeat(seats: readonly Seat[], self: AgentRuntime): Seat | null {
    const taken = new Set(
      this.allAgents()
        .filter((x) => x !== self)
        .map((x) => `${x.targetCell.gx},${x.targetCell.gz}`),
    );
    for (const s of seats) {
      if (!taken.has(`${s.cell.gx},${s.cell.gz}`)) return s;
    }
    return null;
  }

  /* --------------------------- main loop ---------------------------- */

  update(dt: number, speed: number): void {
    const step = dt * speed;
    for (const a of this.agents) this.tickAgent(a, step);
    for (const a of this.crowd) this.tickAgent(a, step);
  }

  private tickAgent(a: AgentRuntime, step: number): void {
    // Walk-cycle bookkeeping for the avatar pose driver.
    const walkingNow = a.state === 'walking' && !a.ride;
    a.moveBlend += ((walkingNow ? 1 : 0) - a.moveBlend) * Math.min(1, step * 8);
    if (walkingNow) a.walkPhase += step * WALK_SPEED;
    if (a.ride) {
      a.ride.t += step / a.ride.duration;
      if (a.ride.t >= 1) this.finishRide(a);
      return;
    }
    if (a.state === 'walking') {
      this.updateWalking(a, step);
      return;
    }
    if (a.controlled) return; // LIVE events hold the agent until idle.
    a.stayTimer -= step;
    if (a.stayTimer <= 0) this.depart(a);
  }

  private updateWalking(a: AgentRuntime, dt: number): void {
    let remaining = WALK_SPEED * dt;
    while (remaining > 0) {
      const next = a.path[0];
      if (!next) {
        this.arrive(a);
        return;
      }
      const w = gridToWorld(next.gx, next.gz);
      const dx = w.x - a.x;
      const dz = w.z - a.z;
      const dist = Math.hypot(dx, dz);
      a.facing = Math.atan2(dx, dz);
      if (dist <= Math.max(remaining, ARRIVE_EPS)) {
        a.x = w.x;
        a.z = w.z;
        remaining -= dist;
        a.path.shift();
        if (a.path.length === 0) {
          this.arrive(a);
          return;
        }
      } else {
        a.x += (dx / dist) * remaining;
        a.z += (dz / dist) * remaining;
        remaining = 0;
      }
    }
  }

  private depart(a: AgentRuntime): void {
    const goal = a.crowd
      ? this.chooseCrowdGoal(a)
      : pickNextGoal(a.profile.deskIndex, this.rng, a.zone);
    this.routeTo(a, goal);
  }

  /** Crowd guests wander public areas on both floors. */
  private chooseCrowdGoal(a: AgentRuntime): LifeGoal {
    const roll = this.rng();
    if (roll < 0.3) {
      const spot = GARDEN_SPOTS[Math.floor(this.rng() * GARDEN_SPOTS.length)]!;
      return {
        zone: 'garden',
        floor: 1,
        cell: spot,
        facing: this.rng() * Math.PI * 2,
        arriveState: 'idle',
        staySeconds: 4 + this.rng() * 6,
      };
    }
    if (roll < 0.5) {
      const seat = this.pickFreeSeat(LOUNGE_SEATS, a) ?? LOUNGE_SEATS[0]!;
      return {
        zone: 'lounge',
        floor: 1,
        cell: seat.cell,
        facing: seat.facing,
        arriveState: 'sitting',
        staySeconds: 5 + this.rng() * 6,
      };
    }
    if (roll < 0.68) {
      const stand = this.pickFreeSeat(COFFEE_STANDS, a) ?? COFFEE_STANDS[0]!;
      return {
        zone: 'coffee_bar',
        floor: 1,
        cell: stand.cell,
        facing: stand.facing,
        arriveState: 'coffee_break',
        staySeconds: 3 + this.rng() * 4,
      };
    }
    if (roll < 0.85) {
      const seat = this.pickFreeSeat(LAB_SEATS, a) ?? LAB_SEATS[0]!;
      return {
        zone: 'lab',
        floor: 2,
        cell: seat.cell,
        facing: seat.facing,
        arriveState: 'typing',
        staySeconds: 5 + this.rng() * 6,
      };
    }
    const seat = this.pickFreeSeat(EXEC_SEATS, a) ?? EXEC_SEATS[0]!;
    return {
      zone: 'executive',
      floor: 2,
      cell: seat.cell,
      facing: seat.facing,
      arriveState: 'sitting',
      staySeconds: 5 + this.rng() * 6,
    };
  }
}

export const simulation = new Simulation();
