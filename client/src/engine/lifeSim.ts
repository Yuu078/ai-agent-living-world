/**
 * lifeSim — the idle-life scheduler (Spec Section 5, Visual Mapping Law).
 *
 * When an agent has no active task it is handed to lifeSim, which schedules
 * believable office behaviour — work at the desk, think, take a coffee break,
 * sit in the lounge, wander the garden — WITHOUT calling any LLM API.
 * This is DEMO_MODE behaviour only; LIVE_MODE tasks (Phase 3) pre-empt it.
 */
import type {
  AgentState,
  FloorId,
  GridPoint,
  TargetZone,
} from '@living-world/shared';
import {
  COFFEE_STANDS,
  DESKS,
  EXEC_SEATS,
  GARDEN_SPOTS,
  LAB_SEATS,
  LOUNGE_SEATS,
  MEETING_SEATS,
  RECEPTION_SPOT,
  type Seat,
} from './worldLayout';

export interface LifeGoal {
  zone: TargetZone;
  cell: GridPoint;
  /** Floor the goal cell lives on (Phase 4 multi-floor). */
  floor: FloorId;
  /** Facing (rotation Y) once arrived. */
  facing: number;
  /** State to play while staying at the goal. */
  arriveState: AgentState;
  /** Seconds to stay before picking the next goal (scaled by world speed). */
  staySeconds: number;
  thoughtBubble?: string;
}

type Rng = () => number;

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

const DESK_BUBBLES = [
  'Reviewing pull requests…',
  'Writing TypeScript…',
  'Sketching interface ideas…',
  'Reading research notes…',
  'Running test suites…',
  'Drafting a status update…',
];
const THINK_BUBBLES = [
  'Thinking through a design…',
  'Weighing two approaches…',
  'Planning the next sprint…',
];

/**
 * Decide what an agent does next. `deskIndex` is the agent's own desk.
 * Weighted so agents mostly work, and regularly take breaks (Hard Rule:
 * idle behaviour must never call an LLM — this is a pure local scheduler).
 */
export function pickNextGoal(deskIndex: number, rng: Rng, currentZone: TargetZone): LifeGoal {
  const roll = rng();

  // Back to desk: type or think (most common; less likely if just there).
  if (roll < (currentZone === 'desk' ? 0.3 : 0.52)) {
    const desk = DESKS[deskIndex]!;
    const thinking = rng() < 0.3;
    return {
      zone: 'desk',
      floor: 1,
      cell: desk.chair,
      facing: desk.facing,
      arriveState: thinking ? 'thinking' : 'typing',
      staySeconds: 7 + rng() * 9,
      thoughtBubble: pick(rng, thinking ? THINK_BUBBLES : DESK_BUBBLES),
    };
  }
  // Coffee break.
  if (roll < 0.68) {
    const stand: Seat = pick(rng, COFFEE_STANDS);
    return {
      zone: 'coffee_bar',
      floor: 1,
      cell: stand.cell,
      facing: stand.facing,
      arriveState: 'coffee_break',
      staySeconds: 5 + rng() * 5,
      thoughtBubble: 'Coffee break ☕',
    };
  }
  // Lounge sit.
  if (roll < 0.8) {
    const seat: Seat = pick(rng, LOUNGE_SEATS);
    return {
      zone: 'lounge',
      floor: 1,
      cell: seat.cell,
      facing: seat.facing,
      arriveState: 'sitting',
      staySeconds: 6 + rng() * 6,
    };
  }
  // Garden stroll.
  if (roll < 0.88) {
    return {
      zone: 'garden',
      floor: 1,
      cell: pick(rng, GARDEN_SPOTS),
      facing: rng() * Math.PI * 2,
      arriveState: 'idle',
      staySeconds: 4 + rng() * 5,
    };
  }
  // Floor 2: R&D lab work or the executive office (Phase 4 — the
  // simulation routes these through the elevator automatically).
  if (roll < 0.94) {
    if (rng() < 0.55) {
      const seat: Seat = pick(rng, LAB_SEATS);
      return {
        zone: 'lab',
        floor: 2,
        cell: seat.cell,
        facing: seat.facing,
        arriveState: 'typing',
        staySeconds: 6 + rng() * 7,
        thoughtBubble: 'Running experiments in the R&D lab…',
      };
    }
    const seat: Seat = pick(rng, EXEC_SEATS);
    return {
      zone: 'executive',
      floor: 2,
      cell: seat.cell,
      facing: seat.facing,
      arriveState: 'sitting',
      staySeconds: 5 + rng() * 6,
      thoughtBubble: 'Reviewing strategy upstairs…',
    };
  }
  // Occasionally drift to the meeting room or reception.
  if (rng() < 0.6) {
    const seat: Seat = pick(rng, MEETING_SEATS);
    return {
      zone: 'meeting_room',
      floor: 1,
      cell: seat.cell,
      facing: seat.facing,
      arriveState: 'meeting',
      staySeconds: 6 + rng() * 6,
      thoughtBubble: 'Syncing with the team…',
    };
  }
  return {
    zone: 'reception',
    floor: 1,
    cell: RECEPTION_SPOT.cell,
    facing: RECEPTION_SPOT.facing,
    arriveState: 'idle',
    staySeconds: 4 + rng() * 4,
  };
}
