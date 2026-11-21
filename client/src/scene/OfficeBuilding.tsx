import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  BUILDING_RECT,
  CELL_SIZE,
  GRID_W,
  GRID_H,
  WALLS,
  gridToWorld,
  type WallRect,
} from '../engine/worldLayout';
import { useWorldStore } from '../store/useWorldStore';

const BASE_WALL_H = 2.8;
const CUTAWAY_WALL_H = 1.05;

/** World-space box for a grid rect (inclusive cells). */
function rectBox(r: { x0: number; z0: number; x1: number; z1: number }) {
  const x0 = (r.x0 - GRID_W / 2) * CELL_SIZE;
  const x1 = (r.x1 + 1 - GRID_W / 2) * CELL_SIZE;
  const z0 = (r.z0 - GRID_H / 2) * CELL_SIZE;
  const z1 = (r.z1 + 1 - GRID_H / 2) * CELL_SIZE;
  return {
    cx: (x0 + x1) / 2,
    cz: (z0 + z1) / 2,
    w: x1 - x0,
    d: z1 - z0,
  };
}

function wallBox(wall: WallRect) {
  const b = rectBox(wall);
  // Thickness: 0.92 of a cell on the short axis, full length on the long axis.
  if (b.w >= b.d) return { ...b, d: 0.92 * CELL_SIZE };
  return { ...b, w: 0.92 * CELL_SIZE };
}

export default function OfficeBuilding() {
  const cutaway = useWorldStore((s) => s.cutaway);
  const wallsGroupRef = useRef<THREE.Group>(null!);
  const roofRef = useRef<THREE.Mesh>(null!);
  const roofMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const tRef = useRef(0); // 0 = normal, 1 = cutaway

  const floor = useMemo(() => rectBox(BUILDING_RECT), []);
  const mid = useMemo(
    () => gridToWorld((BUILDING_RECT.x0 + BUILDING_RECT.x1) / 2, (BUILDING_RECT.z0 + BUILDING_RECT.z1) / 2),
    [],
  );
  void mid;

  useFrame((_, delta) => {
    const target = cutaway ? 1 : 0;
    const k = 1 - Math.exp(-5 * delta);
    tRef.current = THREE.MathUtils.lerp(tRef.current, target, k);
    const t = tRef.current;
    const h = THREE.MathUtils.lerp(BASE_WALL_H, CUTAWAY_WALL_H, t);

    // Scale every wall mesh: geometry is unit-height (1) centred at origin,
    // so scale.y = h and position.y = h/2 keeps the base on the floor.
    if (wallsGroupRef.current) {
      for (const child of wallsGroupRef.current.children) {
        child.scale.y = h;
        child.position.y = h / 2;
      }
    }
    if (roofRef.current) {
      roofRef.current.position.y = 3.05 + t * 2.2;
      // Phase 4: the Floor 1 roof must not cover Floor 2's slab view.
      roofRef.current.visible =
        t < 0.98 && useWorldStore.getState().activeFloor === 1;
    }
    if (roofMatRef.current) {
      roofMatRef.current.transparent = t > 0.01;
      roofMatRef.current.opacity = 1 - t;
    }
  });

  return (
    <group>
      {/* floor slab */}
      <RoundedBox
        args={[floor.w, 0.06, floor.d]}
        radius={0.03}
        position={[floor.cx, 0.0, floor.cz]}
        receiveShadow
      >
        <meshStandardMaterial color="#c9a876" roughness={0.85} />
      </RoundedBox>

      {/* walls — unit-height rounded boxes scaled by the cutaway driver */}
      <group ref={wallsGroupRef}>
        {WALLS.map((wall, i) => {
          const b = wallBox(wall);
          return (
            <RoundedBox
              key={i}
              args={[b.w, 1, b.d]}
              radius={0.04}
              position={[b.cx, BASE_WALL_H / 2, b.cz]}
              castShadow
              receiveShadow
            >
              {wall.kind === 'glass' ? (
                <meshPhysicalMaterial
                  color="#dff3ff"
                  transmission={0.92}
                  thickness={0.15}
                  roughness={0.06}
                  ior={1.4}
                  transparent
                />
              ) : (
                <meshStandardMaterial color="#f0dfc2" roughness={0.92} />
              )}
            </RoundedBox>
          );
        })}
      </group>

      {/* roof */}
      <RoundedBox
        ref={roofRef}
        args={[floor.w + 0.8, 0.18, floor.d + 0.8]}
        radius={0.05}
        position={[floor.cx, 3.05, floor.cz]}
        castShadow
      >
        <meshStandardMaterial
          ref={roofMatRef}
          color="#b5654a"
          roughness={0.8}
        />
      </RoundedBox>
    </group>
  );
}
