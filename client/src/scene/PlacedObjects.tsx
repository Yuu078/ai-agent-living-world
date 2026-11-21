/**
 * PlacedObjects (Phase 4) — renders every user-placed Build Mode object
 * from the persisted world state. Objects only draw on their own floor.
 * In Build Mode they are clickable (select) and the selection gets a
 * highlight pad under its footprint.
 */
import type { FurnitureType } from "@living-world/shared";
import type { GridRect } from "../engine/worldLayout";
import { useDataStore } from '../store/useDataStore';
import { useWorldStore } from '../store/useWorldStore';
import { useBuildStore } from '../store/useBuildStore';
import { FURNITURE_DEFS, floorY, gridToWorld } from '../engine/worldLayout';
import PlacedFurniture from './PlacedFurniture';

function rectCenter(r: GridRect): { x: number; z: number; w: number; d: number } {
  const a = gridToWorld(r.x0, r.z0);
  const b = gridToWorld(r.x1, r.z1);
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    w: Math.abs(b.x - a.x) + 1,
    d: Math.abs(b.z - a.z) + 1,
  };
}

export default function PlacedObjects() {
  const worldObjects = useDataStore((s) => s.worldObjects);
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const buildMode = useWorldStore((s) => s.buildMode);
  const selectedId = useBuildStore((s) => s.selectedId);
  const select = useBuildStore((s) => s.select);

  const placed = worldObjects.filter((o) => o.metadata?.userPlaced === true);

  return (
    <group>
      {placed.map((o) => {
        const floor = o.metadata?.floor === 2 ? 2 : 1;
        if (floor !== activeFloor) return null;
        const type = (o.metadata?.furnitureType as FurnitureType) ?? 'desk';
        const fp = o.metadata?.footprint as GridRect | undefined;
        if (!fp) return null;
        const c = rectCenter(fp);
        const selected = buildMode && selectedId === o.id;
        return (
          <group
            key={o.id}
            position={[c.x, floorY(floor), c.z]}
            rotation={[0, o.rotY, 0]}
            onClick={(e) => {
              if (!buildMode) return;
              e.stopPropagation();
              select(o.id);
            }}
          >
            <PlacedFurniture
              type={type}
              w={FURNITURE_DEFS[type].w}
              d={FURNITURE_DEFS[type].d}
            />
            {selected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[c.w + 0.24, c.d + 0.24]} />
                <meshBasicMaterial color="#facc15" transparent opacity={0.35} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
