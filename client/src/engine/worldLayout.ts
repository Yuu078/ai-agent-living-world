/**
 * World layout — SINGLE SOURCE OF TRUTH for the campus.
 *
 * The A* obstacle grid (pathfinding.ts) and every 3D mesh (OfficeBuilding,
 * Furniture, CampusEnvironment) are generated from the rectangles and cells
 * defined here, so what you see is exactly what the pathfinder collides with.
 * Hard Rule 3: avatars can only stand on / travel through walkable cells.
 */
import type {
  FloorId,
  FurnitureType,
  GridMap,
  GridPoint,
  TargetZone,
} from '@living-world/shared';

export const GRID_W = 44;
export const GRID_H = 34;
export const CELL_SIZE = 1;

/** Vertical distance between Floor 1 (y=0) and Floor 2. */
export const FLOOR_HEIGHT = 3.4;

export function floorY(floor: FloorId): number {
  return floor === 2 ? FLOOR_HEIGHT : 0;
}

/** Grid cell -> world coordinates (cell center). */
export function gridToWorld(gx: number, gz: number): { x: number; z: number } {
  return {
    x: (gx - GRID_W / 2 + 0.5) * CELL_SIZE,
    z: (gz - GRID_H / 2 + 0.5) * CELL_SIZE,
  };
}

export function worldToGrid(x: number, z: number): GridPoint {
  return {
    gx: Math.floor(x / CELL_SIZE + GRID_W / 2),
    gz: Math.floor(z / CELL_SIZE + GRID_H / 2),
  };
}

/** Rotation Y (radians) so an avatar at `from` faces `to`. Avatar forward = +Z at rot 0. */
export function facingToward(from: GridPoint, to: { gx: number; gz: number }): number {
  return Math.atan2(to.gx - from.gx, to.gz - from.gz);
}

export interface GridRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Seat {
  cell: GridPoint;
  /** Rotation Y in radians while occupying the seat. */
  facing: number;
}

const rect = (x0: number, z0: number, x1: number, z1: number): GridRect => ({ x0, z0, x1, z1 });

/* ------------------------------------------------------------------ */
/* Walls (grid rects). Building footprint: gx 6..29, gz 5..22.        */
/* Door gaps: south wall gx 16-17 (main entrance), east wall gz 13-14. */
/* Meeting room (NW): east wall gx=13 with door gap at gz=8,           */
/* south wall gz=11 — rendered as glass.                               */
/* ------------------------------------------------------------------ */
export interface WallRect extends GridRect {
  kind: 'solid' | 'glass';
}

export const WALLS: WallRect[] = [
  // Perimeter — solid
  { ...rect(6, 5, 29, 5), kind: 'solid' }, // north
  { ...rect(6, 22, 15, 22), kind: 'solid' }, // south (left of entrance)
  { ...rect(18, 22, 29, 22), kind: 'solid' }, // south (right of entrance)
  { ...rect(6, 5, 6, 22), kind: 'solid' }, // west
  { ...rect(29, 5, 29, 12), kind: 'solid' }, // east (above side door)
  { ...rect(29, 15, 29, 22), kind: 'solid' }, // east (below side door)
  // Meeting room — glass
  { ...rect(13, 5, 13, 7), kind: 'glass' },
  { ...rect(13, 9, 13, 11), kind: 'glass' },
  { ...rect(6, 11, 13, 11), kind: 'glass' },
];

/** Building footprint (for floor slab / roof placement), grid coords inclusive. */
export const BUILDING_RECT: GridRect = rect(6, 5, 29, 22);

/* ------------------------------------------------------------------ */
/* Furniture footprints (all become A* obstacles)                      */
/* ------------------------------------------------------------------ */
export interface DeskDef {
  footprint: GridRect;
  chair: GridPoint;
  facing: number;
}

function makeDesk(leftGx: number, deskGz: number): DeskDef {
  const chair = { gx: leftGx, gz: deskGz + 1 };
  return {
    footprint: rect(leftGx, deskGz, leftGx + 1, deskGz),
    chair,
    facing: facingToward(chair, { gx: leftGx, gz: deskGz }),
  };
}

/** 6 desks: two rows (gz 14 / gz 18), three columns. Desk index = agent deskIndex. */
export const DESKS: DeskDef[] = [
  makeDesk(9, 14),
  makeDesk(14, 14),
  makeDesk(19, 14),
  makeDesk(9, 18),
  makeDesk(14, 18),
  makeDesk(19, 18),
];

export const MEETING_TABLE: GridRect = rect(8, 7, 11, 8);
const MEETING_CENTER = { gx: 9.5, gz: 7.5 };
export const MEETING_SEATS: Seat[] = [
  { cell: { gx: 9, gz: 6 }, facing: facingToward({ gx: 9, gz: 6 }, MEETING_CENTER) },
  { cell: { gx: 10, gz: 6 }, facing: facingToward({ gx: 10, gz: 6 }, MEETING_CENTER) },
  { cell: { gx: 9, gz: 9 }, facing: facingToward({ gx: 9, gz: 9 }, MEETING_CENTER) },
  { cell: { gx: 10, gz: 9 }, facing: facingToward({ gx: 10, gz: 9 }, MEETING_CENTER) },
  { cell: { gx: 7, gz: 7 }, facing: facingToward({ gx: 7, gz: 7 }, MEETING_CENTER) },
  { cell: { gx: 12, gz: 8 }, facing: facingToward({ gx: 12, gz: 8 }, MEETING_CENTER) },
];

/** Coffee bar counter against the north wall (NE corner). */
export const COFFEE_COUNTER: GridRect = rect(21, 6, 26, 6);
export const COFFEE_STANDS: Seat[] = [
  { cell: { gx: 22, gz: 7 }, facing: facingToward({ gx: 22, gz: 7 }, { gx: 22, gz: 6 }) },
  { cell: { gx: 24, gz: 7 }, facing: facingToward({ gx: 24, gz: 7 }, { gx: 24, gz: 6 }) },
  { cell: { gx: 25, gz: 7 }, facing: facingToward({ gx: 25, gz: 7 }, { gx: 25, gz: 6 }) },
];

/** Reception counter near the main entrance. */
export const RECEPTION_COUNTER: GridRect = rect(15, 20, 18, 20);
export const RECEPTION_SPOT: Seat = {
  cell: { gx: 16, gz: 21 },
  facing: facingToward({ gx: 16, gz: 21 }, { gx: 16, gz: 20 }),
};

/** Lounge (SE inside): sofa footprint + sit spots in front of it. */
export const LOUNGE_SOFA: GridRect = rect(24, 20, 27, 20);
export const LOUNGE_SEATS: Seat[] = [
  { cell: { gx: 25, gz: 19 }, facing: facingToward({ gx: 25, gz: 19 }, { gx: 25, gz: 20 }) },
  { cell: { gx: 26, gz: 19 }, facing: facingToward({ gx: 26, gz: 19 }, { gx: 26, gz: 20 }) },
  { cell: { gx: 24, gz: 19 }, facing: facingToward({ gx: 24, gz: 19 }, { gx: 24, gz: 20 }) },
];

/** Garden: fountain (3x3 obstacle) + benches + trees. */
export const FOUNTAIN: GridRect = rect(34, 26, 36, 28);export const BENCHES: GridRect[] = [rect(31, 24, 32, 24), rect(38, 30, 39, 30)];
export const TREES: GridPoint[] = [
  { gx: 2, gz: 3 },
  { gx: 3, gz: 10 },
  { gx: 2, gz: 20 },
  { gx: 4, gz: 28 },
  { gx: 10, gz: 30 },
  { gx: 20, gz: 31 },
  { gx: 30, gz: 31 },
  { gx: 40, gz: 8 },
  { gx: 33, gz: 3 },
  { gx: 24, gz: 2 },
  { gx: 12, gz: 2 },
  { gx: 40, gz: 20 },
  { gx: 38, gz: 13 },
  { gx: 31, gz: 18 },
  { gx: 5, gz: 31 },
];

/** Walkable garden hangout cells around the fountain / along the path. */
export const GARDEN_SPOTS: GridPoint[] = [
  { gx: 33, gz: 25 },
  { gx: 37, gz: 25 },
  { gx: 35, gz: 24 },
  { gx: 33, gz: 29 },
  { gx: 37, gz: 29 },
  { gx: 30, gz: 26 },
  { gx: 17, gz: 26 },
  { gx: 16, gz: 29 },
];

/** Decorative walkway tiles (walkable) from the main entrance to the fountain. */
export const PATH_TILES: GridPoint[] = (() => {
  const tiles: GridPoint[] = [];
  for (let gz = 23; gz <= 29; gz++) {
    tiles.push({ gx: 16, gz }, { gx: 17, gz });
  }
  for (let gx = 18; gx <= 33; gx++) {
    tiles.push({ gx, gz: 27 }, { gx, gz: 28 });
  }
  return tiles;
})();

/* ------------------------------------------------------------------ */
/* Phase 4 — Elevator + Floor 2 (Executive & R&D Lab)                  */
/*                                                                     */
/* The elevator shaft sits in the NE corner at gx 27..28, gz 6..7 on   */
/* BOTH floors. Three of its cells are solid shaft; the south-west     */
/* cell (27,7) is the car entry — walkable on both floors and the      */
/* transfer point for cross-floor journeys.                            */
/* ------------------------------------------------------------------ */
export const ELEVATOR_ENTRY: GridPoint = { gx: 27, gz: 7 };
export const ELEVATOR_SHAFT: GridRect = rect(27, 6, 28, 7);
const SHAFT_BLOCKS: GridRect[] = [rect(27, 6, 28, 6), rect(28, 7, 28, 7)];

/** Floor 2 walls: full perimeter (no exterior doors upstairs) + a glass
 *  partition at gx=12 between Executive (west) and Lab (east), with a
 *  doorway gap at gz 12..13. */
export const F2_WALLS: WallRect[] = [
  { ...rect(6, 5, 29, 5), kind: 'solid' }, // north
  { ...rect(6, 22, 29, 22), kind: 'solid' }, // south
  { ...rect(6, 5, 6, 22), kind: 'solid' }, // west
  { ...rect(29, 5, 29, 22), kind: 'solid' }, // east
  { ...rect(12, 5, 12, 11), kind: 'glass' }, // partition (north of doorway)
  { ...rect(12, 14, 12, 22), kind: 'glass' }, // partition (south of doorway)
];
export const F2_DOORWAY: GridPoint[] = [
  { gx: 12, gz: 12 },
  { gx: 12, gz: 13 },
];

/** Executive office (Floor 2 west): desk + sofa corner. */
export const EXEC_DESK: DeskDef = (() => {
  const chair = { gx: 8, gz: 7 };
  return {
    footprint: rect(8, 6, 9, 6),
    chair,
    facing: facingToward(chair, { gx: 8, gz: 6 }),
  };
})();
export const EXEC_SOFA: GridRect = rect(8, 17, 10, 17);
export const EXEC_SOFA_SEATS: Seat[] = [8, 9, 10].map((gx) => ({
  cell: { gx, gz: 16 },
  facing: facingToward({ gx, gz: 16 }, { gx, gz: 17 }),
}));
export const EXEC_SEATS: Seat[] = [
  { cell: EXEC_DESK.chair, facing: EXEC_DESK.facing },
  ...EXEC_SOFA_SEATS,
];

/** R&D Lab (Floor 2 east): two benches with stools + a storage shelf. */
export const LAB_BENCH_1: GridRect = rect(15, 9, 17, 9);
export const LAB_BENCH_2: GridRect = rect(21, 9, 23, 9);
export const LAB_SHELF: GridRect = rect(15, 20, 17, 20);
export const LAB_SEATS: Seat[] = [LAB_BENCH_1, LAB_BENCH_2].flatMap((bench) =>
  [bench.x0, bench.x0 + 1, bench.x1].map((gx) => ({
    cell: { gx, gz: bench.z0 + 1 },
    facing: facingToward({ gx, gz: bench.z0 + 1 }, { gx, gz: bench.z0 }),
  })),
);

/** Which floor a zone lives on. */
export function zoneFloor(zone: TargetZone): FloorId {
  return zone === 'lab' || zone === 'executive' ? 2 : 1;
}

function floor2ObstacleRects(): GridRect[] {
  return [
    ...F2_WALLS,
    ...SHAFT_BLOCKS,
    EXEC_DESK.footprint,
    EXEC_SOFA,
    LAB_BENCH_1,
    LAB_BENCH_2,
    LAB_SHELF,
  ];
}

/* ------------------------------------------------------------------ */
/* Obstacle grid                                                       */
/* ------------------------------------------------------------------ */
function allObstacleRects(): GridRect[] {
  return [
    // world border ring (agents stay on campus)
    rect(0, 0, GRID_W - 1, 0),
    rect(0, GRID_H - 1, GRID_W - 1, GRID_H - 1),
    rect(0, 0, 0, GRID_H - 1),
    rect(GRID_W - 1, 0, GRID_W - 1, GRID_H - 1),
    ...WALLS,
    ...SHAFT_BLOCKS,
    ...DESKS.map((d) => d.footprint),
    MEETING_TABLE,
    COFFEE_COUNTER,
    RECEPTION_COUNTER,
    LOUNGE_SOFA,
    FOUNTAIN,
    ...BENCHES,
    ...TREES.map((t) => rect(t.gx, t.gz, t.gx, t.gz)),
  ];
}

function blockRect(blocked: Uint8Array, r: GridRect): void {
  for (let gz = r.z0; gz <= r.z1; gz++) {
    for (let gx = r.x0; gx <= r.x1; gx++) {
      if (gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H) {
        blocked[gz * GRID_W + gx] = 1;
      }
    }
  }
}

export function buildGridMap(floor: FloorId = 1): GridMap {
  const blocked = new Uint8Array(GRID_W * GRID_H);
  if (floor === 2) {
    // Floor 2 exists only inside the building footprint: start fully
    // blocked, carve the interior, then re-block walls + furniture.
    blocked.fill(1);
    for (let gz = 6; gz <= 21; gz++) {
      for (let gx = 7; gx <= 28; gx++) {
        blocked[gz * GRID_W + gx] = 0;
      }
    }
    for (const r of floor2ObstacleRects()) blockRect(blocked, r);
    return { width: GRID_W, height: GRID_H, cellSize: CELL_SIZE, blocked };
  }
  for (const r of allObstacleRects()) blockRect(blocked, r);
  return { width: GRID_W, height: GRID_H, cellSize: CELL_SIZE, blocked };
}

export function isWalkable(grid: GridMap, gx: number, gz: number): boolean {
  if (gx < 0 || gz < 0 || gx >= grid.width || gz >= grid.height) return false;
  return grid.blocked[gz * grid.width + gx] === 0;
}

/** Free-standing cells per zone (desk zone is per-agent, see DESKS). */
export function zoneCells(zone: TargetZone): GridPoint[] {
  switch (zone) {
    case 'meeting_room':
      return MEETING_SEATS.map((s) => s.cell);
    case 'coffee_bar':
      return COFFEE_STANDS.map((s) => s.cell);
    case 'lounge':
      return LOUNGE_SEATS.map((s) => s.cell);
    case 'reception':
      return [RECEPTION_SPOT.cell];
    case 'garden':
      return GARDEN_SPOTS;
    case 'desk':
      return DESKS.map((d) => d.chair);
    case 'lab':
      return LAB_SEATS.map((s) => s.cell);
    case 'executive':
      return EXEC_SEATS.map((s) => s.cell);
  }
}

/* ------------------------------------------------------------------ */
/* Phase 4 — Build Mode: furniture footprints, dynamic obstacles,      */
/* placement validation (collision + reachability).                    */
/* ------------------------------------------------------------------ */

export interface FurnitureDef {
  /** Footprint width (gx) at rotation step 0. */
  w: number;
  /** Footprint depth (gz) at rotation step 0. */
  d: number;
  label: string;
}

export const FURNITURE_DEFS: Record<FurnitureType, FurnitureDef> = {
  desk: { w: 2, d: 1, label: 'Desk' },
  table: { w: 2, d: 2, label: 'Table' },
  plant: { w: 1, d: 1, label: 'Plant' },
  bookshelf: { w: 2, d: 1, label: 'Bookshelf' },
  sofa: { w: 3, d: 1, label: 'Sofa' },
  whiteboard: { w: 2, d: 1, label: 'Whiteboard' },
};

/** Rotation is quarter turns (0..3); odd steps swap width/depth. */
export function footprintFor(
  type: FurnitureType,
  gx: number,
  gz: number,
  rotSteps: number,
): GridRect {
  const def = FURNITURE_DEFS[type];
  const swap = ((rotSteps % 4) + 4) % 4 % 2 === 1;
  const w = swap ? def.d : def.w;
  const d = swap ? def.w : def.d;
  return rect(gx, gz, gx + w - 1, gz + d - 1);
}

export function rectCells(r: GridRect): GridPoint[] {
  const cells: GridPoint[] = [];
  for (let gz = r.z0; gz <= r.z1; gz++) {
    for (let gx = r.x0; gx <= r.x1; gx++) {
      cells.push({ gx, gz });
    }
  }
  return cells;
}

export const cellKeyOf = (c: GridPoint): string => `${c.gx},${c.gz}`;

/** Return a NEW grid with `rects` blocked (the input grid is untouched). */
export function applyDynamicObstacles(grid: GridMap, rects: readonly GridRect[]): GridMap {
  const blocked = new Uint8Array(grid.blocked);
  for (const r of rects) blockRect(blocked, r);
  return { width: grid.width, height: grid.height, cellSize: grid.cellSize, blocked };
}

/**
 * Cells Build Mode may never cover on a floor: the elevator entry and
 * doorway, exterior door gaps, and every zone seat / desk chair (agents
 * must always be able to stand where the world sends them).
 */
export function protectedCells(floor: FloorId): Set<string> {
  const set = new Set<string>();
  const add = (c: GridPoint) => set.add(cellKeyOf(c));
  add(ELEVATOR_ENTRY);
  if (floor === 1) {
    // exterior door gaps + meeting-room door gap (wall cells are already
    // blocked; these are the walkable cells inside the gaps)
    add({ gx: 16, gz: 22 });
    add({ gx: 17, gz: 22 });
    add({ gx: 29, gz: 13 });
    add({ gx: 29, gz: 14 });
    add({ gx: 13, gz: 8 });
    for (const z of TARGET_ZONES_ALL) {
      if (zoneFloor(z) === 1) for (const c of zoneCells(z)) add(c);
    }
  } else {
    for (const c of F2_DOORWAY) add(c);
    for (const z of TARGET_ZONES_ALL) {
      if (zoneFloor(z) === 2) for (const c of zoneCells(z)) add(c);
    }
  }
  return set;
}

const TARGET_ZONES_ALL: readonly TargetZone[] = [
  'desk',
  'meeting_room',
  'coffee_bar',
  'lounge',
  'reception',
  'garden',
  'lab',
  'executive',
];

/** Cells that must stay reachable from the floor anchor after any edit. */
function criticalCells(floor: FloorId): GridPoint[] {
  const cells: GridPoint[] = [ELEVATOR_ENTRY];
  for (const z of TARGET_ZONES_ALL) {
    if (zoneFloor(z) === floor) cells.push(...zoneCells(z));
  }
  return cells;
}

function floorAnchor(floor: FloorId): GridPoint {
  // Floor 1: just inside the main entrance. Floor 2: the elevator entry.
  return floor === 1 ? { gx: 16, gz: 21 } : { ...ELEVATOR_ENTRY };
}

export type PlaceFailReason =
  | 'out_of_bounds'
  | 'occupied'
  | 'protected'
  | 'agent'
  | 'disconnects';

export interface PlaceCheck {
  ok: boolean;
  reason?: PlaceFailReason;
}

/**
 * Validate a candidate footprint on a floor's CURRENT grid (base +
 * already-placed objects). A placement is legal only when every cell is
 * in bounds and walkable, no protected/agent cell is covered, and every
 * zone seat + the elevator stays reachable afterwards (flood fill), so
 * Build Mode can never wall the office off (Hard Rule 3).
 */
export function checkPlacement(
  grid: GridMap,
  floor: FloorId,
  candidate: GridRect,
  extraBlockedCells?: ReadonlySet<string>,
): PlaceCheck {
  const cells = rectCells(candidate);
  for (const c of cells) {
    if (c.gx < 0 || c.gz < 0 || c.gx >= grid.width || c.gz >= grid.height) {
      return { ok: false, reason: 'out_of_bounds' };
    }
  }
  const prot = protectedCells(floor);
  for (const c of cells) {
    if (!isWalkable(grid, c.gx, c.gz)) return { ok: false, reason: 'occupied' };
    if (prot.has(cellKeyOf(c))) return { ok: false, reason: 'protected' };
    if (extraBlockedCells?.has(cellKeyOf(c))) return { ok: false, reason: 'agent' };
  }
  // Reachability: flood fill the tentative grid from the floor anchor.
  const tentative = applyDynamicObstacles(grid, [candidate]);
  const anchor = floorAnchor(floor);
  if (!isWalkable(tentative, anchor.gx, anchor.gz)) {
    return { ok: false, reason: 'disconnects' };
  }
  const seen = new Uint8Array(tentative.width * tentative.height);
  const stack: GridPoint[] = [anchor];
  seen[anchor.gz * tentative.width + anchor.gx] = 1;
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const [dx, dz] of DIRS4) {
      const nx = cur.gx + dx;
      const nz = cur.gz + dz;
      if (!isWalkable(tentative, nx, nz)) continue;
      const idx = nz * tentative.width + nx;
      if (seen[idx]) continue;
      seen[idx] = 1;
      stack.push({ gx: nx, gz: nz });
    }
  }
  for (const c of criticalCells(floor)) {
    if (!seen[c.gz * tentative.width + c.gx]) {
      return { ok: false, reason: 'disconnects' };
    }
  }
  return { ok: true };
}

const DIRS4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
