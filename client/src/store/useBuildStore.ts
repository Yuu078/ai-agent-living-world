/**
 * Build Mode state (Phase 4).
 *
 * Holds the placement workflow: the palette selection, the ghost
 * footprint under the cursor (computed against the live A* grids, so the
 * ghost is green exactly when the real placement check passes), and the
 * selected placed object for move / rotate / delete.
 *
 * All mutations go through the REST API (`/api/world`) and then
 * `refreshWorld()`, so the simulation grids, the 3D scene and other
 * connected clients all converge on the persisted truth.
 */
import { create } from 'zustand';
import type {
  FloorId,
  FurnitureType,
  GridPoint,
  WorldObjectPayload,
} from '@living-world/shared';
import { api } from '../engine/api';
import { simulation } from '../engine/simulation';
import {
  checkPlacement,
  footprintFor,
  floorY,
  type GridRect,
} from '../engine/worldLayout';
import { useDataStore } from './useDataStore';

export interface GhostState {
  cell: GridPoint;
  footprint: GridRect;
  ok: boolean;
  reason: string | null;
}

interface BuildStore {
  /** Furniture kind armed for placement (null = select/move mode). */
  placingType: FurnitureType | null;
  /** Quarter turns (0..3) applied to the next placement / selection. */
  rotation: number;
  ghost: GhostState | null;
  selectedId: string | null;
  /** Last action outcome, shown in the Build panel. */
  notice: string | null;
  busy: boolean;
  setPlacingType: (t: FurnitureType | null) => void;
  rotate: () => void;
  setRotation: (r: number) => void;
  updateGhost: (cell: GridPoint | null, floor: FloorId) => void;
  placeAtGhost: (floor: FloorId) => Promise<void>;
  select: (id: string | null) => void;
  rotateSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  setNotice: (n: string | null) => void;
}

const REASON_TEXT: Record<string, string> = {
  out_of_bounds: 'Outside the world grid.',
  occupied: 'That spot is blocked by a wall or furniture.',
  protected: 'Protected cell — doors, seats and the elevator must stay clear.',
  agent: 'An agent is standing there right now.',
  disconnects: 'That would cut off a room, seat or the elevator.',
};

function placedObjects(): WorldObjectPayload[] {
  return useDataStore
    .getState()
    .worldObjects.filter((o) => o.metadata?.userPlaced === true);
}

function objectFloor(o: WorldObjectPayload): FloorId {
  return o.metadata?.floor === 2 ? 2 : 1;
}

function objectRect(o: WorldObjectPayload): GridRect | null {
  const fp = o.metadata?.footprint as Partial<GridRect> | undefined;
  if (!fp || ![fp.x0, fp.z0, fp.x1, fp.z1].every((v) => typeof v === 'number')) {
    return null;
  }
  return { x0: fp.x0!, z0: fp.z0!, x1: fp.x1!, z1: fp.z1! };
}

function newObjectId(): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `placed-${Date.now().toString(36)}-${rand}`;
}

export const useBuildStore = create<BuildStore>((set, get) => ({
  placingType: null,
  rotation: 0,
  ghost: null,
  selectedId: null,
  notice: null,
  busy: false,

  setPlacingType: (placingType) =>
    set({ placingType, ghost: null, selectedId: null, notice: null }),
  rotate: () => set((s) => ({ rotation: (s.rotation + 1) % 4 })),
  setRotation: (rotation) => set({ rotation: ((rotation % 4) + 4) % 4 }),

  updateGhost: (cell, floor) => {
    const { placingType, rotation, selectedId } = get();
    if (!cell) {
      set({ ghost: null });
      return;
    }
    if (placingType) {
      const footprint = footprintFor(placingType, cell.gx, cell.gz, rotation);
      const grid = simulation.gridFor(floor);
      const check = checkPlacement(grid, floor, footprint, simulation.agentCells(floor));
      set({
        ghost: {
          cell,
          footprint,
          ok: check.ok,
          reason: check.ok ? null : (REASON_TEXT[check.reason!] ?? check.reason!),
        },
      });
      return;
    }
    if (selectedId) {
      // Drag-preview for the selected object: validate against the grid
      // WITHOUT the object itself.
      const obj = placedObjects().find((o) => o.id === selectedId);
      const type = obj?.metadata?.furnitureType as FurnitureType | undefined;
      if (!obj || !type || objectFloor(obj) !== floor) {
        set({ ghost: null });
        return;
      }
      const rot = Number(obj.metadata?.rotation ?? 0) || 0;
      const footprint = footprintFor(type, cell.gx, cell.gz, rot);
      const grid = simulation.gridWithout(floor, selectedId);
      const check = checkPlacement(grid, floor, footprint, simulation.agentCells(floor));
      set({
        ghost: {
          cell,
          footprint,
          ok: check.ok,
          reason: check.ok ? null : (REASON_TEXT[check.reason!] ?? check.reason!),
        },
      });
      return;
    }
    set({ ghost: null });
  },

  placeAtGhost: async (floor) => {
    const { placingType, rotation, ghost, busy } = get();
    if (!placingType || !ghost || busy) return;
    if (!ghost.ok) {
      set({ notice: ghost.reason ?? 'Cannot place there.' });
      return;
    }
    const obj: WorldObjectPayload = {
      id: newObjectId(),
      type: placingType,
      room: floor === 2 ? 'floor2' : 'open_office',
      posX: ghost.footprint.x0,
      posY: floorY(floor),
      posZ: ghost.footprint.z0,
      rotY: rotation * (Math.PI / 2),
      metadata: {
        userPlaced: true,
        floor,
        furnitureType: placingType,
        rotation,
        footprint: ghost.footprint,
      },
    };
    set({ busy: true });
    try {
      await api.saveWorldObject(obj);
      await useDataStore.getState().refreshWorld();
      set({ notice: `${placingType} placed & saved. Agents now path around it.`, selectedId: obj.id });
    } catch (err) {
      set({
        notice: `Save failed (${err instanceof Error ? err.message : 'server offline'}) — is the server running?`,
      });
    } finally {
      set({ busy: false });
    }
  },

  select: (selectedId) => set({ selectedId, ghost: null }),

  rotateSelected: async () => {
    const { selectedId, busy } = get();
    if (!selectedId || busy) return;
    const obj = placedObjects().find((o) => o.id === selectedId);
    const type = obj?.metadata?.furnitureType as FurnitureType | undefined;
    const rect = obj ? objectRect(obj) : null;
    if (!obj || !type || !rect) return;
    const floor = objectFloor(obj);
    const nextRot = ((Number(obj.metadata?.rotation ?? 0) || 0) + 1) % 4;
    const footprint = footprintFor(type, rect.x0, rect.z0, nextRot);
    const grid = simulation.gridWithout(floor, selectedId);
    const check = checkPlacement(grid, floor, footprint, simulation.agentCells(floor));
    if (!check.ok) {
      set({ notice: `Cannot rotate here: ${REASON_TEXT[check.reason!] ?? check.reason}` });
      return;
    }
    set({ busy: true });
    try {
      await api.saveWorldObject({
        ...obj,
        posX: footprint.x0,
        posZ: footprint.z0,
        rotY: nextRot * (Math.PI / 2),
        metadata: { ...obj.metadata, rotation: nextRot, footprint },
      });
      await useDataStore.getState().refreshWorld();
      set({ notice: 'Rotated & saved.' });
    } catch (err) {
      set({ notice: `Rotate failed (${err instanceof Error ? err.message : 'error'}).` });
    } finally {
      set({ busy: false });
    }
  },

  deleteSelected: async () => {
    const { selectedId, busy } = get();
    if (!selectedId || busy) return;
    set({ busy: true });
    try {
      await api.deleteWorldObject(selectedId);
      await useDataStore.getState().refreshWorld();
      set({ notice: 'Removed. The path grid is open again.', selectedId: null, ghost: null });
    } catch (err) {
      set({ notice: `Delete failed (${err instanceof Error ? err.message : 'error'}).` });
    } finally {
      set({ busy: false });
    }
  },

  setNotice: (notice) => set({ notice }),
}));

/** Move the selected object to the ghost cell (used by the scene click). */
export async function moveSelectedToGhost(): Promise<void> {
  const s = useBuildStore.getState();
  const { selectedId, ghost, busy } = s;
  if (!selectedId || !ghost || busy) return;
  if (!ghost.ok) {
    s.setNotice(ghost.reason ?? 'Cannot move there.');
    return;
  }
  const obj = placedObjects().find((o) => o.id === selectedId);
  if (!obj) return;
  useBuildStore.setState({ busy: true });
  try {
    await api.saveWorldObject({
      ...obj,
      posX: ghost.footprint.x0,
      posZ: ghost.footprint.z0,
      metadata: { ...obj.metadata, footprint: ghost.footprint },
    });
    await useDataStore.getState().refreshWorld();
    useBuildStore.setState({ notice: 'Moved & saved.' });
  } catch (err) {
    useBuildStore.setState({
      notice: `Move failed (${err instanceof Error ? err.message : 'error'}).`,
    });
  } finally {
    useBuildStore.setState({ busy: false });
  }
}
