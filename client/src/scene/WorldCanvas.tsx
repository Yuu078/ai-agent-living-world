import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { simulation } from '../engine/simulation';
import { AGENT_PROFILES } from '../engine/agents';
import { floorY } from '../engine/worldLayout';
import { useWorldStore } from '../store/useWorldStore';
import CampusEnvironment from './CampusEnvironment';
import OfficeBuilding from './OfficeBuilding';
import Furniture from './Furniture';
import AgentAvatar from './AgentAvatar';
import Floor2, { ElevatorShaft } from './Floor2';
import PlacedObjects from './PlacedObjects';
import CrowdAvatars from './CrowdAvatars';
import BuildOverlay from './BuildOverlay';

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

/** Reports the real render FPS to the store once per second (Phase 4). */
function FpsMeter() {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, delta) => {
    acc.current.frames += 1;
    acc.current.time += delta;
    if (acc.current.time >= 1) {
      useWorldStore
        .getState()
        .setFps(Math.round(acc.current.frames / acc.current.time));
      acc.current = { frames: 0, time: 0 };
    }
  });
  return null;
}

/**
 * Quality presets (Phase 4): DPR caps per preset; `auto` additionally
 * adapts via drei's PerformanceMonitor (decline -> lower DPR, incline
 * -> raise it back). Shadow quality is applied on the sun light itself.
 */
function QualityManager() {
  const quality = useWorldStore((s) => s.quality);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    if (quality === 'low') setDpr(1);
    else if (quality === 'medium') setDpr([1, 1.5]);
    else if (quality === 'high') setDpr([1, 2]);
    else setDpr([1, 1.75]);
  }, [quality, setDpr]);
  if (quality !== 'auto') return null;
  return (
    <PerformanceMonitor
      onDecline={() => setDpr(0.85)}
      onIncline={() => setDpr([1, 1.75])}
    />
  );
}

/** Smoothly drives the camera between the store's presets (floor-aware). */
function CameraRig() {
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const camera = useThree((s) => s.camera);
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpPos = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!controls) return;
    const state = useWorldStore.getState();
    const preset = state.cameraPreset;
    if (preset === 'orbit') return; // free control
    const k = 1 - Math.exp(-3 * delta);
    const fy = floorY(state.activeFloor);

    if (preset === 'isometric') {
      tmpPos.current.set(24, 24 + fy, 24);
      tmpTarget.current.set(0, fy, 0);
    } else if (preset === 'top') {
      tmpPos.current.set(0, 46 + fy, 0.01);
      tmpTarget.current.set(0, fy, 0);
    } else {
      // follow — switch the viewed floor to the agent's floor.
      const id =
        state.followAgentId ??
        state.selectedAgentId ??
        AGENT_PROFILES[0]!.id;
      const rt = simulation.getAgent(id);
      if (!rt) return;
      if (!rt.ride && rt.floor !== state.activeFloor) {
        state.setActiveFloor(rt.floor);
      }
      const ay = floorY(rt.floor);
      tmpPos.current.set(rt.x + 9, ay + 9, rt.z + 9);
      tmpTarget.current.set(rt.x, ay + 0.8, rt.z);
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
  const quality = useWorldStore((s) => s.quality);
  const shadowSize = quality === 'high' ? 2048 : 1024;

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
        key={`sun-${quality}`}
        position={[18, 26, 10]}
        color="#ffd9a8"
        intensity={1.6}
        castShadow={quality !== 'low'}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
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
      <FpsMeter />
      <QualityManager />
      <CampusEnvironment />
      <OfficeBuilding />
      <Furniture />
      <Floor2 />
      <ElevatorShaft />
      <PlacedObjects />
      {AGENT_PROFILES.map((p) => (
        <AgentAvatar key={p.id} agentId={p.id} />
      ))}
      <CrowdAvatars />
      <BuildOverlay />
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
