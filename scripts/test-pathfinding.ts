/**
 * GATE 1 — pathfinding proof.
 *
 * Verifies, on the EXACT grid the 3D scene uses (worldLayout.buildGridMap),
 * that A* finds a legal path (4-adjacent steps, zero blocked cells) from
 * every agent desk to every meeting-room seat and every coffee-bar stand —
 * plus lounge, reception and garden spots for full coverage.
 *
 * Run: npm run test:path   (exit code 0 = all pass)
 */
import { buildGridMap, isWalkable, zoneCells, DESKS } from '../client/src/engine/worldLayout';
import { findPath, isPathLegal } from '../client/src/engine/pathfinding';
import type { GridPoint, TargetZone } from '@living-world/shared';

const grid = buildGridMap();

let blockedCount = 0;
for (const b of grid.blocked) if (b === 1) blockedCount++;
console.log(`Grid: ${grid.width}x${grid.height} cells, ${blockedCount} blocked, ${grid.width * grid.height - blockedCount} walkable`);
console.log('');

const zones: TargetZone[] = ['meeting_room', 'coffee_bar', 'lounge', 'reception', 'garden'];

let total = 0;
let passed = 0;
const failures: string[] = [];

function check(label: string, from: GridPoint, to: GridPoint) {
  total++;
  const path = findPath(grid, from, to);
  if (!path) {
    failures.push(`${label}: NO PATH from (${from.gx},${from.gz}) to (${to.gx},${to.gz})`);
    return;
  }
  if (!isPathLegal(grid, path)) {
    failures.push(`${label}: ILLEGAL PATH (blocked cell or non-adjacent step) to (${to.gx},${to.gz})`);
    return;
  }
  const end = path[path.length - 1]!;
  if (end.gx !== to.gx || end.gz !== to.gz) {
    failures.push(`${label}: path ends at (${end.gx},${end.gz}), expected (${to.gx},${to.gz})`);
    return;
  }
  passed++;
}

// 1. Every destination cell must itself be walkable.
for (const zone of zones) {
  for (const cell of zoneCells(zone)) {
    total++;
    if (isWalkable(grid, cell.gx, cell.gz)) passed++;
    else failures.push(`zone ${zone}: destination (${cell.gx},${cell.gz}) is BLOCKED`);
  }
}
for (const desk of DESKS) {
  total++;
  if (isWalkable(grid, desk.chair.gx, desk.chair.gz)) passed++;
  else failures.push(`desk chair (${desk.chair.gx},${desk.chair.gz}) is BLOCKED`);
}

// 2. Desk -> meeting room & coffee bar (the GATE 1 requirement), and beyond.
DESKS.forEach((desk, i) => {
  for (const zone of zones) {
    for (const cell of zoneCells(zone)) {
      check(`desk ${i} -> ${zone}`, desk.chair, cell);
    }
  }
  // Desk -> every other desk (agents cross the office freely).
  DESKS.forEach((other, j) => {
    if (i !== j) check(`desk ${i} -> desk ${j}`, desk.chair, other.chair);
  });
});

// 3. Show one sample path so a human can eyeball the route.
const sample = findPath(grid, DESKS[0]!.chair, zoneCells('coffee_bar')[0]!);
console.log(`Sample path desk 0 -> coffee bar (${sample ? sample.length : 0} steps):`);
console.log(sample ? sample.map((p) => `(${p.gx},${p.gz})`).join(' -> ') : 'NONE');
console.log('');

console.log(`RESULT: ${passed}/${total} checks passed`);
if (failures.length > 0) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('ALL PATHFINDING CHECKS PASSED');
