/**
 * 2D Grid A* pathfinding (Hard Rule 3: zero-clipping movement).
 *
 * 4-directional movement only — diagonal steps are forbidden because a
 * diagonal between two free cells can still cut the corner of an obstacle.
 * With 4-connectivity, every step moves between two orthogonally adjacent
 * walkable cell centers, so a path can never cross a wall or a desk.
 */
import type { GridMap, GridPoint } from '@living-world/shared';
import { isWalkable } from './worldLayout';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function heuristic(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz); // Manhattan — admissible for 4-dir
}

/**
 * Find a path from `start` to `goal` (both inclusive) or return null when
 * either endpoint is blocked / out of bounds, or no route exists.
 */
export function findPath(grid: GridMap, start: GridPoint, goal: GridPoint): GridPoint[] | null {
  if (!isWalkable(grid, start.gx, start.gz) || !isWalkable(grid, goal.gx, goal.gz)) {
    return null;
  }
  if (start.gx === goal.gx && start.gz === goal.gz) return [{ ...start }];

  const { width, height } = grid;
  const index = (gx: number, gz: number) => gz * width + gx;
  const cameFrom = new Int32Array(width * height).fill(-1);
  const gScore = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(width * height);

  // Simple binary heap keyed by fScore.
  const heap: number[] = [];
  const fScore = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const push = (idx: number) => {
    heap.push(idx);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (fScore[heap[parent]!]! <= fScore[heap[i]!]!) break;
      [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
      i = parent;
    }
  };
  const pop = (): number | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last !== undefined) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < heap.length && fScore[heap[l]!]! < fScore[heap[smallest]!]!) smallest = l;
        if (r < heap.length && fScore[heap[r]!]! < fScore[heap[smallest]!]!) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
        i = smallest;
      }
    }
    return top;
  };

  const startIdx = index(start.gx, start.gz);
  const goalIdx = index(goal.gx, goal.gz);
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(start.gx, start.gz, goal.gx, goal.gz);
  push(startIdx);

  while (heap.length > 0) {
    const current = pop();
    if (current === undefined) break;
    if (current === goalIdx) {
      // Reconstruct.
      const path: GridPoint[] = [];
      let cur = current;
      while (cur !== -1) {
        path.push({ gx: cur % width, gz: Math.floor(cur / width) });
        cur = cameFrom[cur]!;
      }
      path.reverse();
      return path;
    }
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % width;
    const cz = Math.floor(current / width);
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!isWalkable(grid, nx, nz)) continue;
      const nIdx = index(nx, nz);
      const tentative = gScore[current]! + 1;
      if (tentative < gScore[nIdx]!) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentative;
        fScore[nIdx] = tentative + heuristic(nx, nz, goal.gx, goal.gz);
        push(nIdx);
      }
    }
  }
  return null;
}

/** Validate that a path is legal: starts/ends correctly, steps are 4-adjacent, no blocked cells. */
export function isPathLegal(grid: GridMap, path: GridPoint[]): boolean {
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (!isWalkable(grid, p.gx, p.gz)) return false;
    if (i > 0) {
      const prev = path[i - 1]!;
      if (Math.abs(p.gx - prev.gx) + Math.abs(p.gz - prev.gz) !== 1) return false;
    }
  }
  return path.length > 0;
}
