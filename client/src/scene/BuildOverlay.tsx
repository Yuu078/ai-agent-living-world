/**
 * BuildOverlay (Phase 4) — the Build Mode interaction layer: an
 * invisible hit-plane over the active floor that turns pointer position
 * into grid cells, drives the placement ghost (green = the real
 * `checkPlacement` passed, red = blocked, with the reason in the Build
 * panel), and turns clicks into place / move actions.
 *
 * Click-vs-drag: OrbitControls also uses drags, so a "click" only
 * counts when the pointer moved less than 6px between down and up.
 */
import { useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useWorldStore } from '../store/useWorldStore';
import { moveSelectedToGhost, useBuildStore } from '../store/useBuildStore';
import {
  FURNITURE_DEFS,
  GRID_H,
  GRID_W,
  floorY,
  gridToWorld,
  worldToGrid,
} from '../engine/worldLayout';
import PlacedFurniture from './PlacedFurniture';
import type { FurnitureType } from '@living-world/shared';

export default function BuildOverlay() {
  const buildMode = useWorldStore((s) => s.buildMode);
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const ghost = useBuildStore((s) => s.ghost);
  const placingType = useBuildStore((s) => s.placingType);
  const rotation = useBuildStore((s) => s.rotation);
  const downPos = useRef<{ x: number; y: number } | null>(null);

  if (!buildMode) return null;
  const y = floorY(activeFloor) + 0.03;

  const cellFromEvent = (e: ThreeEvent<PointerEvent>) =>
    worldToGrid(e.point.x, e.point.z);

  const ghostCenter = ghost
    ? (() => {
        const a = gridToWorld(ghost.footprint.x0, ghost.footprint.z0);
        const b = gridToWorld(ghost.footprint.x1, ghost.footprint.z1);
        return {
          x: (a.x + b.x) / 2,
          z: (a.z + b.z) / 2,
          w: Math.abs(b.x - a.x) + 1,
          d: Math.abs(b.z - a.z) + 1,
        };
      })()
    : null;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, y, 0]}
        onPointerMove={(e) => {
          useBuildStore.getState().updateGhost(cellFromEvent(e), activeFloor);
        }}
        onPointerOut={() => useBuildStore.getState().updateGhost(null, activeFloor)}
        onPointerDown={(e) => {
          downPos.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          const down = downPos.current;
          downPos.current = null;
          if (
            down &&
            Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
          ) {
            return; // it was a camera drag, not a click
          }
          const s = useBuildStore.getState();
          if (s.placingType) {
            void s.placeAtGhost(activeFloor);
          } else if (s.selectedId && s.ghost) {
            void moveSelectedToGhost();
          }
        }}
      >
        <planeGeometry args={[GRID_W, GRID_H]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* placement / move ghost */}
      {ghost && ghostCenter && (
        <group position={[ghostCenter.x, y + 0.01, ghostCenter.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
            <planeGeometry args={[ghostCenter.w, ghostCenter.d]} />
            <meshBasicMaterial
              color={ghost.ok ? '#22c55e' : '#ef4444'}
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
          {placingType && (
            <group rotation={[0, rotation * (Math.PI / 2), 0]}>
              <PlacedFurniture
                type={placingType as FurnitureType}
                w={FURNITURE_DEFS[placingType as FurnitureType].w}
                d={FURNITURE_DEFS[placingType as FurnitureType].d}
              />
            </group>
          )}
        </group>
      )}
    </group>
  );
}
