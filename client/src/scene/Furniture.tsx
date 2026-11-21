import { RoundedBox } from '@react-three/drei';
import {
  COFFEE_COUNTER,
  DESKS,
  LOUNGE_SEATS,
  LOUNGE_SOFA,
  MEETING_SEATS,
  MEETING_TABLE,
  RECEPTION_COUNTER,
  gridToWorld,
  type GridRect,
} from '../engine/worldLayout';
import { AGENT_PROFILES } from '../engine/agents';
import { useWorldStore } from '../store/useWorldStore';
import type { AgentState } from '@living-world/shared';

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

function monitorGlow(state: AgentState | undefined): { color: string; intensity: number } {
  switch (state) {
    case 'typing':
      return { color: '#22d3ee', intensity: 1.6 };
    case 'tool_calling':
      return { color: '#4ade80', intensity: 1.6 };
    case 'thinking':
      return { color: '#a78bfa', intensity: 1.2 };
    default:
      return { color: '#164e63', intensity: 0.35 };
  }
}

/** Simple office chair, forward = +Z rotated by `facing`. */
function OfficeChair({
  x,
  z,
  facing,
  color = '#3f4756',
  scale = 1,
}: {
  x: number;
  z: number;
  facing: number;
  color?: string;
  scale?: number;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]} scale={scale}>
      <RoundedBox args={[0.5, 0.07, 0.48]} radius={0.03} position={[0, 0.46, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RoundedBox>
      <RoundedBox args={[0.48, 0.55, 0.06]} radius={0.03} position={[0, 0.82, -0.24]} castShadow>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.44, 8]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.28, 0.05, 12]} />
        <meshStandardMaterial color="#2b3038" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
}

function Desk({ index }: { index: number }) {
  const desk = DESKS[index]!;
  const agentViews = useWorldStore((s) => s.agentViews);
  const owner = AGENT_PROFILES.find((p) => p.deskIndex === index);
  const glow = monitorGlow(owner ? agentViews[owner.id]?.state : undefined);

  const c = rectCenter(desk.footprint);
  const chairW = gridToWorld(desk.chair.gx, desk.chair.gz);

  return (
    <group>
      {/* desktop */}
      <RoundedBox args={[1.92, 0.08, 0.96]} radius={0.03} position={[c.x, 0.74, c.z]} castShadow receiveShadow>
        <meshStandardMaterial color="#a97c50" roughness={0.6} />
      </RoundedBox>
      {/* leg panels */}
      {[-0.82, 0.82].map((dx) => (
        <RoundedBox
          key={dx}
          args={[0.07, 0.7, 0.84]}
          radius={0.03}
          position={[c.x + dx, 0.37, c.z]}
          castShadow
        >
          <meshStandardMaterial color="#8a6238" roughness={0.7} />
        </RoundedBox>
      ))}
      {/* monitor: post + screen on the far edge from the chair, facing the chair */}
      <group position={[c.x, 0, c.z - 0.28]} rotation={[0, desk.facing, 0]}>
        <mesh position={[0, 0.92, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 0.3, 8]} />
          <meshStandardMaterial color="#23272e" roughness={0.4} metalness={0.5} />
        </mesh>
        <RoundedBox args={[0.92, 0.56, 0.05]} radius={0.03} position={[0, 1.18, 0]} rotation={[-0.08, 0, 0]} castShadow>
          <meshStandardMaterial
            color="#0b1520"
            roughness={0.35}
            emissive={glow.color}
            emissiveIntensity={glow.intensity}
          />
        </RoundedBox>
      </group>
      {/* keyboard slab */}
      <RoundedBox args={[0.62, 0.03, 0.22]} radius={0.015} position={[c.x, 0.8, c.z + 0.18]}>
        <meshStandardMaterial color="#2e333b" roughness={0.6} />
      </RoundedBox>
      <OfficeChair x={chairW.x} z={chairW.z} facing={desk.facing} />
    </group>
  );
}

function MeetingRoom() {
  const c = rectCenter(MEETING_TABLE);
  return (
    <group>
      <RoundedBox args={[3.9, 0.1, 1.9]} radius={0.04} position={[c.x, 0.74, c.z]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a6642" roughness={0.55} />
      </RoundedBox>
      {[
        [-1.7, -0.7],
        [1.7, -0.7],
        [-1.7, 0.7],
        [1.7, 0.7],
      ].map(([dx, dz], i) => (
        <RoundedBox key={i} args={[0.09, 0.7, 0.09]} radius={0.03} position={[c.x + dx!, 0.37, c.z + dz!]} castShadow>
          <meshStandardMaterial color="#6e4f30" roughness={0.7} />
        </RoundedBox>
      ))}
      {MEETING_SEATS.map((seat, i) => {
        const w = gridToWorld(seat.cell.gx, seat.cell.gz);
        return <OfficeChair key={i} x={w.x} z={w.z} facing={seat.facing} color="#54606e" scale={0.95} />;
      })}
    </group>
  );
}

function CoffeeBar() {
  const c = rectCenter(COFFEE_COUNTER);
  return (
    <group>
      <RoundedBox args={[5.92, 0.95, 0.92]} radius={0.04} position={[c.x, 0.475, c.z]} castShadow receiveShadow>
        <meshStandardMaterial color="#6f4f37" roughness={0.75} />
      </RoundedBox>
      <RoundedBox args={[6.05, 0.06, 1.0]} radius={0.03} position={[c.x, 0.98, c.z]} castShadow>
        <meshStandardMaterial color="#c9a876" roughness={0.5} />
      </RoundedBox>
      {/* espresso machine, left end */}
      <group position={[c.x - 2.3, 1.01, c.z]}>
        <RoundedBox args={[0.6, 0.5, 0.5]} radius={0.05} position={[0, 0.25, 0]} castShadow>
          <meshStandardMaterial color="#2b2f36" roughness={0.35} metalness={0.4} />
        </RoundedBox>
        <mesh position={[0.18, 0.32, 0.26]}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshStandardMaterial color="#111827" emissive="#f59e0b" emissiveIntensity={1.4} />
        </mesh>
      </group>
      {/* cups */}
      {[-0.6, 0.3, 1.2].map((dx, i) => (
        <mesh key={i} position={[c.x + dx, 1.07, c.z + 0.1]} castShadow>
          <cylinderGeometry args={[0.055, 0.045, 0.11, 10]} />
          <meshStandardMaterial color="#f5f0e6" roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Reception() {
  const c = rectCenter(RECEPTION_COUNTER);
  return (
    <group>
      <RoundedBox args={[c.w - 0.08, 1.02, 0.92]} radius={0.04} position={[c.x, 0.51, c.z]} castShadow receiveShadow>
        <meshStandardMaterial color="#7d5a3c" roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[c.w + 0.05, 0.06, 1.0]} radius={0.03} position={[c.x, 1.05, c.z]} castShadow>
        <meshStandardMaterial color="#d9b98a" roughness={0.5} />
      </RoundedBox>
      {/* potted plant on the counter */}
      <group position={[c.x + 1.4, 1.08, c.z]}>
        <mesh position={[0, 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.08, 0.18, 10]} />
          <meshStandardMaterial color="#b5654a" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.32, 0]} castShadow>
          <sphereGeometry args={[0.17, 10, 8]} />
          <meshStandardMaterial color="#4e7d3a" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function Lounge() {
  const c = rectCenter(LOUNGE_SOFA);
  const firstSeat = LOUNGE_SEATS[0]!;
  const seatW = gridToWorld(firstSeat.cell.gx, firstSeat.cell.gz);
  return (
    <group>
      {/* sofa (faces -Z toward the seats at gz 19) */}
      <group position={[c.x, 0, c.z]}>
        <RoundedBox args={[2.9, 0.45, 0.9]} radius={0.06} position={[0, 0.28, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#7d8fb3" roughness={0.95} />
        </RoundedBox>
        <RoundedBox args={[2.9, 0.55, 0.22]} radius={0.06} position={[0, 0.72, 0.36]} castShadow>
          <meshStandardMaterial color="#71829f" roughness={0.95} />
        </RoundedBox>
        {[-1.38, 1.38].map((dx) => (
          <RoundedBox key={dx} args={[0.24, 0.35, 0.9]} radius={0.06} position={[dx, 0.62, 0]} castShadow>
            <meshStandardMaterial color="#71829f" roughness={0.95} />
          </RoundedBox>
        ))}
      </group>
      {/* armchairs at the sit spots */}
      {LOUNGE_SEATS.map((seat, i) => {
        const w = gridToWorld(seat.cell.gx, seat.cell.gz);
        return (
          <group key={i} position={[w.x, 0, w.z]} rotation={[0, seat.facing, 0]}>
            <RoundedBox args={[0.62, 0.32, 0.58]} radius={0.06} position={[0, 0.24, 0]} castShadow>
              <meshStandardMaterial color="#8fa3c4" roughness={0.95} />
            </RoundedBox>
            <RoundedBox args={[0.62, 0.5, 0.14]} radius={0.06} position={[0, 0.6, -0.24]} castShadow>
              <meshStandardMaterial color="#7d8fb3" roughness={0.95} />
            </RoundedBox>
          </group>
        );
      })}
      {/* coffee table in front of the sofa */}
      <mesh position={[seatW.x + 0.5, 0.22, c.z - 1.0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.07, 18]} />
        <meshStandardMaterial color="#a97c50" roughness={0.5} />
      </mesh>
      <mesh position={[seatW.x + 0.5, 0.1, c.z - 1.0]}>
        <cylinderGeometry args={[0.06, 0.16, 0.2, 10]} />
        <meshStandardMaterial color="#6e4f30" roughness={0.7} />
      </mesh>
    </group>
  );
}

export default function Furniture() {
  return (
    <group>
      {DESKS.map((_, i) => (
        <Desk key={i} index={i} />
      ))}
      <MeetingRoom />
      <CoffeeBar />
      <Reception />
      <Lounge />
    </group>
  );
}
