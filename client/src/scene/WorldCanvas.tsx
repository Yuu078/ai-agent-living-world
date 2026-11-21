import { useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { simulation } from '../engine/simulation';
import { AGENT_PROFILES } from '../engine/agents';
import { useWorldStore } from '../store/useWorldStore';
import CampusEnvironment from './CampusEnvironment';
import OfficeBuilding from './OfficeBuilding';
import Furniture from './Furniture';
import AgentAvatar from './AgentAvatar';

/** Advances the demo simulation + world clock every frame (inside Canvas). */
function SimulationDriver() {
  const accRef = useRef(0);
  useFrame((_, delta) => {
    const speed = useWorldStore.getState().speed;
    simulation.update(delta, speed);
    // 1 real second = 1 sim minute * speed.
    accRef.current += delta * speed;
    if (accRef.current >= 0.5) {
      const minutes = accRef.current;
      accRef.current = 0;
      useWorldStore.getState().tickClock(minutes);
    }
  });
  return null;
}

/** Smoothly drives the camera between the store's presets. */
function CameraRig() {
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const camera = useThree((s) => s.camera);
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpPos = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!controls) return;
    const preset = useWorldStore.getState().cameraPreset;
    if (preset === 'orbit') return; // free control
    const k = 1 - Math.exp(-3 * delta);

    if (preset === 'isometric') {
      tmpPos.current.set(24, 24, 24);
      tmpTarget.current.set(0, 0, 0);
    } else if (preset === 'top') {
      tmpPos.current.set(0, 46, 0.01);
      tmpTarget.current.set(0, 0, 0);
    } else {
      // follow
      const state = useWorldStore.getState();
      const id =
        state.followAgentId ??
        state.selectedAgentId ??
        AGENT_PROFILES[0]!.id;
      const rt = simulation.getAgent(id);
      if (!rt) return;
      tmpPos.current.set(rt.x + 9, 9, rt.z + 9);
      tmpTarget.current.set(rt.x, 0.8, rt.z);
    }
    camera.position.lerp(tmpPos.current, k);
    controls.target.lerp(tmpTarget.current, k);
    controls.update();
  });
  return null;
}

export default function WorldCanvas() {
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const cameraPreset = useWorldStore((s) => s.cameraPreset);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [24, 24, 24], fov: 42, near: 0.1, far: 220 }}
      onPointerMissed={() => selectAgent(null)}
    >
      <color attach="background" args={['#a8c8e0']} />
      <fog attach="fog" args={['#cfe4f2', 55, 130]} />

      <hemisphereLight args={['#fff2df', '#8a7a5f', 0.75]} />
      <directionalLight
        position={[18, 26, 10]}
        color="#ffd9a8"
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-bias={-0.0004}
      />
      <ambientLight intensity={0.15} color="#ffe9c9" />

      <SimulationDriver />
      <CampusEnvironment />
      <OfficeBuilding />
      <Furniture />
      {AGENT_PROFILES.map((p) => (
        <AgentAvatar key={p.id} agentId={p.id} />
      ))}
      <CameraRig />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enableRotate={cameraPreset === 'orbit'}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={4}
        maxDistance={90}
      />
    </Canvas>
  );
}
