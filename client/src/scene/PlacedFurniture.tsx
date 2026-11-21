/**
 * PlacedFurniture (Phase 4) — one low-poly mesh per Build Mode furniture
 * type, drawn centred on its footprint with the base at y=0. The parent
 * group positions/rotates it. `w`/`d` are the footprint size in world
 * units (1 unit = 1 grid cell) at rotation step 0.
 */
import { RoundedBox } from '@react-three/drei';
import type { FurnitureType } from '@living-world/shared';

export default function PlacedFurniture({
  type,
  w,
  d,
}: {
  type: FurnitureType;
  w: number;
  d: number;
}) {
  switch (type) {
    case 'desk':
      return (
        <group>
          <RoundedBox args={[w - 0.08, 0.08, Math.max(0.5, d - 0.04)]} radius={0.03} position={[0, 0.74, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#b08954" roughness={0.6} />
          </RoundedBox>
          {[-1, 1].map((s) => (
            <RoundedBox key={s} args={[0.07, 0.7, Math.max(0.4, d - 0.16)]} radius={0.03} position={[s * (w / 2 - 0.12), 0.37, 0]} castShadow>
              <meshStandardMaterial color="#8a6238" roughness={0.7} />
            </RoundedBox>
          ))}
          <RoundedBox args={[0.7, 0.42, 0.04]} radius={0.02} position={[0, 1.12, -Math.max(0.2, d / 2 - 0.18)]} castShadow>
            <meshStandardMaterial color="#0b1520" roughness={0.35} emissive="#164e63" emissiveIntensity={0.5} />
          </RoundedBox>
        </group>
      );
    case 'table':
      return (
        <group>
          <RoundedBox args={[w - 0.1, 0.09, d - 0.1]} radius={0.04} position={[0, 0.72, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#8a6642" roughness={0.55} />
          </RoundedBox>
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sz], i) => (
            <RoundedBox key={i} args={[0.09, 0.68, 0.09]} radius={0.03} position={[sx! * (w / 2 - 0.16), 0.34, sz! * (d / 2 - 0.16)]} castShadow>
              <meshStandardMaterial color="#6e4f30" roughness={0.7} />
            </RoundedBox>
          ))}
        </group>
      );
    case 'plant':
      return (
        <group>
          <mesh position={[0, 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.15, 0.32, 12]} />
            <meshStandardMaterial color="#b5654a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <sphereGeometry args={[0.3, 12, 10]} />
            <meshStandardMaterial color="#4e7d3a" roughness={0.9} />
          </mesh>
          <mesh position={[0.16, 0.78, 0.08]} castShadow>
            <sphereGeometry args={[0.19, 10, 8]} />
            <meshStandardMaterial color="#5d8a46" roughness={0.9} />
          </mesh>
        </group>
      );
    case 'bookshelf':
      return (
        <group position={[0, 0, -d / 2 + 0.19]}>
          <RoundedBox args={[w - 0.06, 1.7, 0.36]} radius={0.03} position={[0, 0.85, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#6e5136" roughness={0.75} />
          </RoundedBox>
          {[0.45, 0.9, 1.35].map((y, i) => (
            <group key={i}>
              <RoundedBox args={[w - 0.2, 0.04, 0.3]} radius={0.01} position={[0, y, 0.03]}>
                <meshStandardMaterial color="#8a6238" roughness={0.7} />
              </RoundedBox>
              {[-0.5, -0.15, 0.25, 0.55].map((dx, j) => (
                <RoundedBox key={j} args={[0.16, 0.3, 0.2]} radius={0.01} position={[dx * (w / 2), y + 0.17, 0.03]}>
                  <meshStandardMaterial
                    color={['#b3543f', '#3f6fb3', '#c9a227', '#4e7d3a'][(i + j) % 4]}
                    roughness={0.8}
                  />
                </RoundedBox>
              ))}
            </group>
          ))}
        </group>
      );
    case 'sofa':
      return (
        <group>
          <RoundedBox args={[w - 0.1, 0.45, Math.max(0.6, d - 0.1)]} radius={0.06} position={[0, 0.28, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#b3748f" roughness={0.95} />
          </RoundedBox>
          <RoundedBox args={[w - 0.1, 0.55, 0.22]} radius={0.06} position={[0, 0.72, d / 2 - 0.14]} castShadow>
            <meshStandardMaterial color="#a26480" roughness={0.95} />
          </RoundedBox>
          {[-1, 1].map((s) => (
            <RoundedBox key={s} args={[0.24, 0.35, Math.max(0.6, d - 0.1)]} radius={0.06} position={[s * (w / 2 - 0.16), 0.62, 0]} castShadow>
              <meshStandardMaterial color="#a26480" roughness={0.95} />
            </RoundedBox>
          ))}
        </group>
      );
    case 'whiteboard':
      return (
        <group position={[0, 0, -d / 2 + 0.12]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (w / 2 - 0.14), 0.55, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 1.1, 8]} />
              <meshStandardMaterial color="#2b3038" roughness={0.5} metalness={0.5} />
            </mesh>
          ))}
          <RoundedBox args={[w - 0.08, 1.05, 0.05]} radius={0.02} position={[0, 1.18, 0]} castShadow>
            <meshStandardMaterial color="#eef2f5" roughness={0.35} />
          </RoundedBox>
          <RoundedBox args={[w - 0.3, 0.5, 0.02]} radius={0.01} position={[0, 1.3, 0.04]}>
            <meshStandardMaterial color="#dbe7f3" roughness={0.4} />
          </RoundedBox>
        </group>
      );
  }
}
