/**
 * CrowdAvatars (Phase 4 performance) — the guest crowd rendered as TWO
 * InstancedMeshes (capsule bodies + sphere heads) instead of up to 24
 * full avatar rigs. Matrices/colours are written imperatively per frame
 * from the simulation; instances on the other floor (or beyond the
 * current crowd size) are scaled to zero.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { simulation } from '../engine/simulation';
import { floorY } from '../engine/worldLayout';
import { useWorldStore } from '../store/useWorldStore';

const MAX_CROWD = 24;

export default function CrowdAvatars() {
  const bodies = useRef<THREE.InstancedMesh>(null!);
  const heads = useRef<THREE.InstancedMesh>(null!);
  const dummy = useRef(new THREE.Object3D());
  const color = useRef(new THREE.Color());

  // (Re)apply instance colours whenever the crowd is toggled.
  const crowdEnabled = useWorldStore((s) => s.crowdEnabled);
  useEffect(() => {
    for (const mesh of [bodies.current, heads.current]) {
      if (!mesh) continue;
      for (let i = 0; i < MAX_CROWD; i++) {
        const agent = simulation.crowdAgents()[i];
        color.current.set(agent ? agent.profile.color : '#9ca3af');
        if (mesh === heads.current) color.current.set('#f2c79b'); // skin tone
        mesh.setColorAt(i, color.current);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [crowdEnabled]);

  useFrame(({ clock }) => {
    if (!bodies.current || !heads.current) return;
    const activeFloor = useWorldStore.getState().activeFloor;
    const crowd = simulation.crowdAgents();
    const t = clock.elapsedTime;
    for (let i = 0; i < MAX_CROWD; i++) {
      const a = crowd[i];
      let visible = false;
      let y = 0;
      if (a) {
        y = floorY(a.floor);
        visible = a.floor === activeFloor;
        if (a.ride) {
          y = THREE.MathUtils.lerp(floorY(a.ride.from), floorY(a.ride.to), a.ride.t);
          visible = activeFloor === a.ride.from || activeFloor === a.ride.to;
        }
      }
      const d = dummy.current;
      if (!a || !visible) {
        d.position.set(0, -10, 0);
        d.scale.setScalar(0.0001);
        d.updateMatrix();
        bodies.current.setMatrixAt(i, d.matrix);
        heads.current.setMatrixAt(i, d.matrix);
        continue;
      }
      const bob =
        a.state === 'walking' ? Math.abs(Math.sin(t * 7 + i * 1.7)) * 0.04 : 0;
      d.rotation.set(0, a.facing, 0);
      d.scale.setScalar(1);
      d.position.set(a.x, y + 0.52 + bob, a.z);
      d.updateMatrix();
      bodies.current.setMatrixAt(i, d.matrix);
      d.position.set(a.x, y + 1.13 + bob, a.z);
      d.updateMatrix();
      heads.current.setMatrixAt(i, d.matrix);
    }
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, MAX_CROWD]}
        castShadow
        frustumCulled={false}
      >
        <capsuleGeometry args={[0.17, 0.52, 4, 10]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, MAX_CROWD]}
        castShadow
        frustumCulled={false}
      >
        <sphereGeometry args={[0.145, 12, 10]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  );
}
