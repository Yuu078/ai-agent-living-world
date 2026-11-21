/**
 * Gate 4 grid tests (Phase 4) — Build Mode obstacle rebuild + Floor 2
 * pathfinding, at the grid level (no server needed).
 *
 * Proves:
 *  1. A desk placed in the main corridor becomes a real A* obstacle:
 *     the route exists, stays legal, avoids the footprint, and detours
 *     (longer than the straight route through the same cells).
 *  2. Dynamic obstacles never mutate the base grid.
 *  3. Floor 2 routes: elevator -> lab seats and elevator -> executive
 *     seats (through the glass-partition doorway) exist and are legal.
 *  4. checkPlacement rejects: occupied cells, the elevator entry,
 *     and a placement that would wall off the executive office
 *     (reachability guard), while accepting a legal corridor desk.
 *
 * Run: npm run test:gate4-grid
 */
import { findPath, isPathLegal } from '../client/src/engine/pathfinding';
import {
  ELEVATOR_ENTRY,
  applyDynamicObstacles,
  buildGridMap,
  checkPlacement,
  footprintFor,
  isWalkable,
} from '../client/src/engine/worldLayout';
import type { GridPoint } from '@living-world/shared';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const key = (c: GridPoint) => `${c.gx},${c.gz}`;

/* 1 — corridor detour around a placed desk */
console.log('\n[Gate 4] Build Mode obstacle rebuild');
const grid1 = buildGridMap(1);
const from: GridPoint = { gx: 7, gz: 16 };
const to: GridPoint = { gx: 28, gz: 16 };
const before = findPath(grid1, from, to);
check('baseline corridor path exists', before !== null);
check(
  'baseline path runs straight through (16,16)',
  !!before && before.some((c) => c.gx === 16 && c.gz === 16),
);

const deskRect = footprintFor('desk', 16, 16, 0); // cells (16,16)-(17,16)
const gridWithDesk = applyDynamicObstacles(grid1, [deskRect]);
check(
  'footprint cells blocked in the rebuilt grid',
  !isWalkable(gridWithDesk, 16, 16) && !isWalkable(gridWithDesk, 17, 16),
);
check(
  'base grid NOT mutated by applyDynamicObstacles',
  isWalkable(grid1, 16, 16) && isWalkable(grid1, 17, 16),
);
const after = findPath(gridWithDesk, from, to);
check('detour path exists after placement', after !== null);
check('detour path is legal (zero clipping)', !!after && isPathLegal(gridWithDesk, after));
check(
  'detour path avoids the desk footprint',
  !!after &&
    !after.some(
      (c) => key(c) === '16,16' || key(c) === '17,16',
    ),
);
check(
  'detour is longer than the straight baseline',
  !!before && !!after && after.length > before.length,
  `before=${before?.length} after=${after?.length}`,
);

/* 2 — Floor 2 routes */
console.log('\n[Gate 4] Floor 2 pathfinding');
const grid2 = buildGridMap(2);
check('elevator entry walkable on Floor 2', isWalkable(grid2, ELEVATOR_ENTRY.gx, ELEVATOR_ENTRY.gz));
const toLab = findPath(grid2, ELEVATOR_ENTRY, { gx: 15, gz: 10 });
check('elevator -> lab seat path exists', toLab !== null);
check('elevator -> lab path is legal', !!toLab && isPathLegal(grid2, toLab));
const toExec = findPath(grid2, ELEVATOR_ENTRY, { gx: 8, gz: 7 });
check('elevator -> executive chair path exists (through doorway)', toExec !== null);
check('elevator -> executive path is legal', !!toExec && isPathLegal(grid2, toExec));
const f1Elevator = findPath(grid1, { gx: 16, gz: 21 }, ELEVATOR_ENTRY);
check('Floor 1 entrance -> elevator entry path exists', f1Elevator !== null);
check('Floor 1 elevator path is legal', !!f1Elevator && isPathLegal(grid1, f1Elevator));

/* 3 — placement validation */
console.log('\n[Gate 4] checkPlacement');
const noAgents = new Set<string>();
check(
  'legal corridor desk accepted',
  checkPlacement(grid1, 1, deskRect, noAgents).ok,
);
const onDesk = checkPlacement(grid1, 1, footprintFor('desk', 9, 14, 0), noAgents);
check('placing on a built-in desk rejected (occupied)', !onDesk.ok && onDesk.reason === 'occupied');
const onElevator = checkPlacement(grid1, 1, footprintFor('plant', 27, 7, 0), noAgents);
check('placing on the elevator entry rejected', !onElevator.ok);
const wallOff = checkPlacement(
  grid2,
  2,
  footprintFor('whiteboard', 11, 12, 1), // cells (11,12)-(11,13): seals the exec doorway approach
  noAgents,
);
check(
  'walling off the executive office rejected (disconnects)',
  !wallOff.ok && wallOff.reason === 'disconnects',
  `reason=${wallOff.reason}`,
);
const onDoorway = checkPlacement(grid2, 2, footprintFor('desk', 12, 12, 0), noAgents);
check('placing on the Floor 2 doorway rejected (protected)', !onDoorway.ok);
const agentBlocked = checkPlacement(
  grid1,
  1,
  footprintFor('plant', 20, 16, 0),
  new Set(['20,16']),
);
check('placing on an agent cell rejected (agent)', !agentBlocked.ok && agentBlocked.reason === 'agent');

console.log(`\nRESULT: ${passed}/${passed + failed} Gate 4 grid checks passed`);
if (failed > 0) {
  console.log('GATE 4 GRID: FAILED');
  process.exit(1);
}
console.log('GATE 4 GRID: PASSED');
