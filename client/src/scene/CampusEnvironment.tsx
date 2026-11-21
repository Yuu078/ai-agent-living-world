import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  BENCHES,
  FOUNTAIN,
  PATH_TILES,
  TREES,
  gridToWorld,
  type GridRect,
} from '../engine/worldLayout';

/** Deterministic pseudo-random in [0,1) from an index — stable across renders. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
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

function Trees() {
  const trunkRef = useRef<THREE.InstancedMesh>(null!);
  const canopyRef = useRef<THREE.InstancedMesh>(null!);

  const transforms = useMemo(
    () =>
      TREES.map((t, i) => {
        const w = gridToWorld(t.gx, t.gz);
        const s = 0.85 + hash01(i) * 0.5;
        const rot = hash01(i + 100) * Math.PI * 2;
        return { ...w, s, rot };
      }),
    [],
  );

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    transforms.forEach((t, i) => {
      e.set(0, t.rot, 0);
      q.setFromEuler(e);
      pos.set(t.x, 0.45 * t.s, t.z);
      scl.set(t.s, t.s, t.s);
      m.compose(pos, q, scl);
      trunkRef.current.setMatrixAt(i, m);
      pos.set(t.x, (0.9 + 0.55) * t.s, t.z);
      m.compose(pos, q, scl);
      canopyRef.current.setMatrixAt(i, m);
    });
    trunkRef.current.instanceMatrix.needsUpdate = true;
    canopyRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[undefined, undefined, TREES.length]}
        castShadow
      >
        <cylinderGeometry args={[0.12, 0.17, 0.9, 8]} />
        <meshStandardMaterial color="#8a5a3b" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={canopyRef}
        args={[undefined, undefined, TREES.length]}
        castShadow
      >
        <sphereGeometry args={[0.78, 12, 10]} />
        <meshStandardMaterial color="#4e7d3a" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function Fountain() {
  const c = rectCenter(FOUNTAIN);
  const waterRef = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!waterRef.current) return;
    waterRef.current.position.y =
      0.52 + Math.sin(clock.elapsedTime * 1.6) * 0.03;
  });
  return (
    <group position={[c.x, 0, c.z]}>
      {/* basin */}
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.7, 1.85, 0.55, 24]} />
        <meshStandardMaterial color="#b8ab90" roughness={0.9} />
      </mesh>
      {/* water */}
      <mesh ref={waterRef} position={[0, 0.52, 0]}>
        <cylinderGeometry args={[1.42, 1.42, 0.12, 24]} />
        <meshStandardMaterial
          color="#7fd4ff"
          roughness={0.1}
          metalness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* center pillar + orb */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.7, 10]} />
        <meshStandardMaterial color="#b8ab90" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <sphereGeometry args={[0.24, 14, 12]} />
        <meshStandardMaterial color="#9fc6d8" roughness={0.25} metalness={0.2} />
      </mesh>
    </group>
  );
}

function Bench({ rect }: { rect: GridRect }) {
  const c = rectCenter(rect);
  const alongX = c.w >= c.d;
  return (
    <group
      position={[c.x, 0, c.z]}
      rotation={[0, alongX ? 0 : Math.PI / 2, 0]}
    >
      <RoundedBox
        args={[Math.max(c.w, 1.6), 0.09, 0.45]}
        radius={0.03}
        position={[0, 0.45, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#9a6b44" roughness={0.85} />
      </RoundedBox>
      <RoundedBox
        args={[Math.max(c.w, 1.6), 0.4, 0.07]}
        radius={0.03}
        position={[0, 0.78, -0.22]}
        castShadow
      >
        <meshStandardMaterial color="#9a6b44" roughness={0.85} />
      </RoundedBox>
      {[-0.6, 0.6].map((x) => (
        <RoundedBox
          key={x}
          args={[0.09, 0.45, 0.4]}
          radius={0.03}
          position={[x, 0.22, 0]}
          castShadow
        >
          <meshStandardMaterial color="#6e4f30" roughness={0.9} />
        </RoundedBox>
      ))}
    </group>
  );
}

export default function CampusEnvironment() {
  return (
    <group>
      {/* outer apron — planeGeometry faces +Z by default, so rotate it flat
          onto the ground (an unrotated plane here was the Phase 1 bug that
          hid the north half of the office behind a vertical green wall) */}
      <mesh position={[0, -0.23, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#5d8148" roughness={1} />
      </mesh>
      {/* main lawn */}
      <RoundedBox
        args={[46, 0.2, 36]}
        radius={0.05}
        position={[0, -0.11, 0]}
        receiveShadow
      >
        <meshStandardMaterial color="#7fae5f" roughness={1} />
      </RoundedBox>

      {/* walkway tiles */}
      {PATH_TILES.map((t, i) => {
        const w = gridToWorld(t.gx, t.gz);
        return (
          <RoundedBox
            key={i}
            args={[0.98, 0.05, 0.98]}
            radius={0.02}
            position={[w.x, 0.025, w.z]}
            receiveShadow
          >
            <meshStandardMaterial color="#cfc4ae" roughness={0.95} />
          </RoundedBox>
        );
      })}

      <Trees />
      <Fountain />
      {BENCHES.map((b, i) => (
        <Bench key={i} rect={b} />
      ))}
    </group>
  );
}
