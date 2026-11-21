/**
 * Floor 2 (Phase 4) — Executive office (west) + R&D Lab (east), stacked
 * on the Floor 1 footprint, plus the elevator shaft that connects them.
 *
 * The whole floor group is only visible while the user views Floor 2
 * (the Floor 1 roof hides/shows with the floor switcher too). Walls use
 * the same cutaway height as Floor 1 so the interior stays readable
 * from the isometric camera.
 */
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  BUILDING_RECT,
  CELL_SIZE,
  ELEVATOR_SHAFT,
  EXEC_DESK,
  EXEC_SOFA,
  F2_WALLS,
  FLOOR_HEIGHT,
  GRID_H,
  GRID_W,
  LAB_BENCH_1,
  LAB_BENCH_2,
  LAB_SEATS,
  LAB_SHELF,
  EXEC_SOFA_SEATS,
  floorY,
  gridToWorld,
  type GridRect,
  type WallRect,
} from '../engine/worldLayout';
import { simulation } from '../engine/simulation';
import { useWorldStore } from '../store/useWorldStore';

const WALL_H = 1.05; // matches Floor 1 cutaway height

function rectBox(r: { x0: number; z0: number; x1: number; z1: number }) {
  const x0 = (r.x0 - GRID_W / 2) * CELL_SIZE;
  const x1 = (r.x1 + 1 - GRID_W / 2) * CELL_SIZE;
  const z0 = (r.z0 - GRID_H / 2) * CELL_SIZE;
  const z1 = (r.z1 + 1 - GRID_H / 2) * CELL_SIZE;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

function wallBox(wall: WallRect) {
  const b = rectBox(wall);
  if (b.w >= b.d) return { ...b, d: 0.92 * CELL_SIZE };
  return { ...b, w: 0.92 * CELL_SIZE };
}

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

function Stool({ gx, gz, facing }: { gx: number; gz: number; facing: number }) {
  const w = gridToWorld(gx, gz);
  return (
    <group position={[w.x, 0, w.z]} rotation={[0, facing, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.07, 14]} />
        <meshStandardMaterial color="#54606e" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.44, 8]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.2, 0.22, 0.05, 12]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}

function Floor2Furniture() {
  const exec = rectCenter(EXEC_DESK.footprint);
  const execChair = gridToWorld(EXEC_DESK.chair.gx, EXEC_DESK.chair.gz);
  const sofa = rectCenter(EXEC_SOFA);
  const shelf = rectCenter(LAB_SHELF);
  return (
    <group>
      {/* executive desk + chair */}
      <RoundedBox args={[1.92, 0.08, 0.96]} radius={0.03} position={[exec.x, 0.74, exec.z]} castShadow receiveShadow>
        <meshStandardMaterial color="#5d4037" roughness={0.5} />
      </RoundedBox>
      {[-0.82, 0.82].map((dx) => (
        <RoundedBox key={dx} args={[0.07, 0.7, 0.84]} radius={0.03} position={[exec.x + dx, 0.37, exec.z]} castShadow>
          <meshStandardMaterial color="#4e342e" roughness={0.6} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.92, 0.56, 0.05]} radius={0.03} position={[exec.x, 1.18, exec.z - 0.28]} castShadow>
        <meshStandardMaterial color="#0b1520" roughness={0.35} emissive="#164e63" emissiveIntensity={0.5} />
      </RoundedBox>
      <group position={[execChair.x, 0, execChair.z]} rotation={[0, EXEC_DESK.facing, 0]}>
        <RoundedBox args={[0.52, 0.07, 0.5]} radius={0.03} position={[0, 0.46, 0]} castShadow>
          <meshStandardMaterial color="#37474f" roughness={0.8} />
        </RoundedBox>
        <RoundedBox args={[0.5, 0.6, 0.06]} radius={0.03} position={[0, 0.85, -0.25]} castShadow>
          <meshStandardMaterial color="#37474f" roughness={0.8} />
        </RoundedBox>
      </group>

      {/* executive sofa corner */}
      <group position={[sofa.x, 0, sofa.z]}>
        <RoundedBox args={[2.9, 0.45, 0.9]} radius={0.06} position={[0, 0.28, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#4a6741" roughness={0.95} />
        </RoundedBox>
        <RoundedBox args={[2.9, 0.55, 0.22]} radius={0.06} position={[0, 0.72, 0.36]} castShadow>
          <meshStandardMaterial color="#3f5a38" roughness={0.95} />
        </RoundedBox>
        {[-1.38, 1.38].map((dx) => (
          <RoundedBox key={dx} args={[0.24, 0.35, 0.9]} radius={0.06} position={[dx, 0.62, 0]} castShadow>
            <meshStandardMaterial color="#3f5a38" roughness={0.95} />
          </RoundedBox>
        ))}
      </group>
      {EXEC_SOFA_SEATS.map((seat, i) => {
        const w = gridToWorld(seat.cell.gx, seat.cell.gz);
        return (
          <group key={i} position={[w.x, 0, w.z]} rotation={[0, seat.facing, 0]}>
            <RoundedBox args={[0.62, 0.32, 0.58]} radius={0.06} position={[0, 0.24, 0]} castShadow>
              <meshStandardMaterial color="#55744c" roughness={0.95} />
            </RoundedBox>
            <RoundedBox args={[0.62, 0.5, 0.14]} radius={0.06} position={[0, 0.6, -0.24]} castShadow>
              <meshStandardMaterial color="#4a6741" roughness={0.95} />
            </RoundedBox>
          </group>
        );
      })}

      {/* lab benches + stools + shelf */}
      {[LAB_BENCH_1, LAB_BENCH_2].map((bench, bi) => {
        const c = rectCenter(bench);
        return (
          <group key={bi}>
            <RoundedBox args={[c.w - 0.06, 0.09, 0.94]} radius={0.03} position={[c.x, 0.78, c.z]} castShadow receiveShadow>
              <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.3} />
            </RoundedBox>
            {[-1, 1].map((s) => (
              <RoundedBox key={s} args={[0.08, 0.74, 0.8]} radius={0.02} position={[c.x + s * (c.w / 2 - 0.14), 0.37, c.z]} castShadow>
                <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
              </RoundedBox>
            ))}
            {/* bench props: beakers / device */}
            <mesh position={[c.x - 0.7, 0.95, c.z]} castShadow>
              <cylinderGeometry args={[0.07, 0.09, 0.24, 10]} />
              <meshStandardMaterial color="#7dd3fc" roughness={0.15} transparent opacity={0.75} />
            </mesh>
            <RoundedBox args={[0.5, 0.3, 0.4]} radius={0.03} position={[c.x + 0.7, 0.97, c.z]} castShadow>
              <meshStandardMaterial color="#1f2937" roughness={0.4} emissive="#22d3ee" emissiveIntensity={0.35} />
            </RoundedBox>
          </group>
        );
      })}
      {LAB_SEATS.map((seat, i) => (
        <Stool key={i} gx={seat.cell.gx} gz={seat.cell.gz} facing={seat.facing} />
      ))}
      <group position={[shelf.x, 0, shelf.z]}>
        <RoundedBox args={[shelf.w - 0.06, 1.8, 0.5]} radius={0.03} position={[0, 0.9, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#455a64" roughness={0.6} metalness={0.2} />
        </RoundedBox>
        {[0.5, 1.0, 1.5].map((y, i) => (
          <RoundedBox key={i} args={[shelf.w - 0.3, 0.28, 0.56]} radius={0.02} position={[0, y, 0]}>
            <meshStandardMaterial color={['#546e7a', '#607d8b', '#78909c'][i]} roughness={0.7} />
          </RoundedBox>
        ))}
      </group>
    </group>
  );
}

export default function Floor2() {
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const cutaway = useWorldStore((s) => s.cutaway);
  const slab = rectBox(BUILDING_RECT);
  return (
    <group visible={activeFloor === 2} position={[0, FLOOR_HEIGHT, 0]}>
      {/* floor slab (doubles as Floor 1's ceiling) */}
      <RoundedBox args={[slab.w, 0.08, slab.d]} radius={0.03} position={[slab.cx, -0.02, slab.cz]} receiveShadow>
        <meshStandardMaterial color="#b99c72" roughness={0.85} />
      </RoundedBox>
      {/* walls + glass partition */}
      {F2_WALLS.map((wall, i) => {
        const b = wallBox(wall);
        return (
          <RoundedBox key={i} args={[b.w, WALL_H, b.d]} radius={0.04} position={[b.cx, WALL_H / 2, b.cz]} castShadow receiveShadow>
            {wall.kind === 'glass' ? (
              <meshPhysicalMaterial color="#dff3ff" transmission={0.92} thickness={0.15} roughness={0.06} ior={1.4} transparent />
            ) : (
              <meshStandardMaterial color="#e8d5b5" roughness={0.92} />
            )}
          </RoundedBox>
        );
      })}
      {/* building roof above Floor 2 — hidden in cutaway, like Floor 1 */}
      {!cutaway && (
        <RoundedBox args={[slab.w + 0.8, 0.18, slab.d + 0.8]} radius={0.05} position={[slab.cx, 2.95, slab.cz]} castShadow>
          <meshStandardMaterial color="#8d5a41" roughness={0.8} />
        </RoundedBox>
      )}
      <Floor2Furniture />
    </group>
  );
}

/**
 * The elevator shaft: corner posts + a car that follows the active
 * ride's progress (parked at the last visited floor otherwise). The
 * upper segment only renders while viewing Floor 2.
 */
export function ElevatorShaft() {
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const carRef = useRef<THREE.Group>(null!);
  const carY = useRef(0);
  const c = rectCenter(ELEVATOR_SHAFT);

  useFrame((_, delta) => {
    if (!carRef.current) return;
    let target = carY.current;
    let riding = false;
    for (const a of simulation.allAgents()) {
      if (a.ride) {
        target = THREE.MathUtils.lerp(floorY(a.ride.from), floorY(a.ride.to), a.ride.t);
        riding = true;
        break;
      }
    }
    if (!riding) {
      // Park at the floor of any agent currently upstairs, else ground.
      target = simulation.allAgents().some((a) => a.floor === 2) ? FLOOR_HEIGHT : 0;
    }
    const k = 1 - Math.exp(-8 * delta);
    carY.current = THREE.MathUtils.lerp(carY.current, target, riding ? 1 : k);
    carRef.current.position.y = carY.current;
  });

  const post = (dx: number, dz: number, h: number, y: number) => (
    <mesh position={[c.x + dx, y, c.z + dz]} castShadow>
      <boxGeometry args={[0.12, h, 0.12]} />
      <meshStandardMaterial color="#54606e" roughness={0.4} metalness={0.6} />
    </mesh>
  );

  return (
    <group>
      {/* lower segment: always visible */}
      {post(-0.94, -0.94, FLOOR_HEIGHT, FLOOR_HEIGHT / 2)}
      {post(0.94, -0.94, FLOOR_HEIGHT, FLOOR_HEIGHT / 2)}
      {post(-0.94, 0.94, FLOOR_HEIGHT, FLOOR_HEIGHT / 2)}
      {post(0.94, 0.94, FLOOR_HEIGHT, FLOOR_HEIGHT / 2)}
      {/* upper segment: only while viewing Floor 2 */}
      <group visible={activeFloor === 2}>
        {post(-0.94, -0.94, FLOOR_HEIGHT, FLOOR_HEIGHT * 1.5)}
        {post(0.94, -0.94, FLOOR_HEIGHT, FLOOR_HEIGHT * 1.5)}
        {post(-0.94, 0.94, FLOOR_HEIGHT, FLOOR_HEIGHT * 1.5)}
        {post(0.94, 0.94, FLOOR_HEIGHT, FLOOR_HEIGHT * 1.5)}
      </group>
      {/* the car */}
      <group ref={carRef} position={[0, 0, 0]}>
        <RoundedBox args={[1.7, 2.1, 1.7]} radius={0.04} position={[c.x, 1.05, c.z]} castShadow>
          <meshStandardMaterial color="#90a4ae" roughness={0.35} metalness={0.55} transparent opacity={0.55} />
        </RoundedBox>
        <RoundedBox args={[1.74, 0.08, 1.74]} radius={0.02} position={[c.x, 2.14, c.z]}>
          <meshStandardMaterial color="#54606e" roughness={0.4} metalness={0.6} />
        </RoundedBox>
      </group>
      {/* floor pads at both entries */}
      {[0, FLOOR_HEIGHT].map((y) => (
        <mesh key={y} position={[c.x, y + 0.012, c.z]} receiveShadow>
          <boxGeometry args={[2, 0.024, 2]} />
          <meshStandardMaterial color="#78909c" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}
