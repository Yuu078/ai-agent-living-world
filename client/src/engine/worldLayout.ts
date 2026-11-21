/**
 * World layout — SINGLE SOURCE OF TRUTH for the campus.
 *
 * The A* obstacle grid (pathfinding.ts) and every 3D mesh (OfficeBuilding,
 * Furniture, CampusEnvironment) are generated from the rectangles and cells
 * defined here, so what you see is exactly what the pathfinder collides with.
 * Hard Rule 3: avatars can only stand on / travel through walkable cells.
 */
import type { GridMap, GridPoint, TargetZone } from '@living-world/shared';

export const GRID_W = 44;
export const GRID_H = 34;
export const CELL_SIZE = 1;

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
export const FOUNTAIN: GridRect = rect(34, 26, 36, 28);
export const BENCHES: GridRect[] = [rect(31, 24, 32, 24), rect(38, 30, 39, 30)];
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

export function buildGridMap(): GridMap {
  const blocked = new Uint8Array(GRID_W * GRID_H);
  for (const r of allObstacleRects()) {
    for (let gz = r.z0; gz <= r.z1; gz++) {
      for (let gx = r.x0; gx <= r.x1; gx++) {
        blocked[gz * GRID_W + gx] = 1;
      }
    }
  }
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
  }
}
