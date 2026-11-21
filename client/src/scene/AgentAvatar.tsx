import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { simulation } from '../engine/simulation';
import { AGENT_PROFILES } from '../engine/agents';
import { floorY } from '../engine/worldLayout';
import { useWorldStore } from '../store/useWorldStore';
import type { AgentState } from '@living-world/shared';

const HAIR_PALETTE = ['#3b2f2f', '#5b3a29', '#222222', '#704214', '#4a4a4a', '#2f4858'];
const PANTS = '#44506b';
const SKIN = '#f2c79b';

function statusColor(state: AgentState): string {
  switch (state) {
    case 'typing':
      return '#22c55e';
    case 'thinking':
      return '#a78bfa';
    case 'walking':
      return '#38bdf8';
    case 'coffee_break':
      return '#fb923c';
    case 'meeting':
      return '#facc15';
    case 'error':
      return '#ef4444';
    case 'tool_calling':
      return '#4ade80';
    case 'celebrating':
      return '#34d399';
    default:
      return '#9ca3af';
  }
}

const damp = THREE.MathUtils.damp;

export default function AgentAvatar({ agentId }: { agentId: string }) {
  const profile = useMemo(
    () => AGENT_PROFILES.find((p) => p.id === agentId) ?? AGENT_PROFILES[0]!,
    [agentId],
  );
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const view = useWorldStore((s) => s.agentViews[agentId]);
  // Phase 4: drei Html labels ignore group visibility, so gate them in
  // React — an agent upstairs must not leak its label into Floor 1.
  const activeFloor = useWorldStore((s) => s.activeFloor);
  const showLabels = (view?.floor ?? 1) === activeFloor;

  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Mesh>(null!);
  const head = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const indicatorMat = useRef<THREE.MeshStandardMaterial>(null!);
  const cupRef = useRef<THREE.Group>(null!);
  const sitT = useRef(1); // agents start seated at their desks
  const colorRef = useRef({ r: 0.6, g: 0.6, b: 0.6 });
  const tmpColor = useRef(new THREE.Color());

  const hair = HAIR_PALETTE[profile.deskIndex % HAIR_PALETTE.length] ?? '#3b2f2f';
  const state: AgentState = view?.state ?? 'idle';
  const bubble = view?.thoughtBubble;

  useFrame(({ clock }, delta) => {
    const rt = simulation.getAgent(agentId);
    if (!rt || !root.current) return;
    const t = clock.elapsedTime;
    const k = 1 - Math.exp(-10 * delta); // pose smoothing
    void k;

    const walking = rt.moveBlend > 0.03;
    const sitting =
      !walking &&
      (rt.state === 'typing' ||
        rt.state === 'sitting' ||
        rt.state === 'meeting' ||
        rt.state === 'tool_calling');
    sitT.current = damp(sitT.current, sitting ? 1 : 0, 10, delta);
    const sit = sitT.current;

    // Phase 4: floor height + elevator-ride interpolation + floor gating
    // (an avatar is only drawn on the floor the user is viewing; during
    // a ride it is drawn on both endpoint floors).
    const activeFloor = useWorldStore.getState().activeFloor;
    let y = floorY(rt.floor);
    let floorVisible = rt.floor === activeFloor;
    if (rt.ride) {
      y = THREE.MathUtils.lerp(floorY(rt.ride.from), floorY(rt.ride.to), rt.ride.t);
      floorVisible =
        activeFloor === rt.ride.from || activeFloor === rt.ride.to;
    }
    root.current.visible = floorVisible;

    // root position + facing (+ celebration jump / error shake)
    if (rt.state === 'celebrating') y += Math.abs(Math.sin(t * 6)) * 0.18;
    const shakeX = rt.state === 'error' ? Math.sin(t * 30) * 0.012 : 0;
    root.current.position.set(rt.x + shakeX, y, rt.z);
    root.current.rotation.y = rt.facing;

    // walk bob
    const bob = walking
      ? Math.abs(Math.cos(rt.walkPhase * 3.4)) * 0.045 * rt.moveBlend
      : 0;
    body.current.position.y = bob - sit * 0.3;

    // legs: walk swing vs sit fold vs stand
    const swing = Math.sin(rt.walkPhase * 3.4) * 0.62 * rt.moveBlend;
    legL.current.rotation.x = damp(
      legL.current.rotation.x,
      walking ? swing : -1.45 * sit,
      14,
      delta,
    );
    legR.current.rotation.x = damp(
      legR.current.rotation.x,
      walking ? -swing : -1.45 * sit,
      14,
      delta,
    );

    // arms — defaults: walk swing / sit rest / idle sway
    let aL = walking ? -swing * 0.7 : Math.sin(t * 1.8) * 0.05;
    let aR = walking ? swing * 0.7 : Math.sin(t * 1.8 + 1) * 0.05;
    if (sitting) {
      aL = -0.9;
      aR = -0.9;
    }
    switch (rt.state) {
      case 'typing':
        aL = -1.15 + Math.sin(t * 11) * 0.09;
        aR = -1.15 + Math.sin(t * 11 + 1.7) * 0.09;
        break;
      case 'tool_calling':
        aL = -1.05;
        aR = -0.55;
        break;
      case 'meeting':
        aL = -0.85;
        aR = -0.7 + Math.sin(t * 1.6) * 0.25;
        break;
      case 'thinking':
        aL = -0.5;
        aR = -2.25;
        break;
      case 'coffee_break':
        aL = Math.sin(t * 1.4) * 0.06;
        aR = -1.55 + Math.sin(t * 0.9) * 0.05;
        break;
      case 'celebrating':
        aL = -2.8 + Math.sin(t * 6) * 0.15;
        aR = -2.8 - Math.sin(t * 6) * 0.15;
        break;
      default:
        break;
    }
    // blend seated base with state pose by sit factor for standing states
    armL.current.rotation.x = damp(armL.current.rotation.x, aL, 12, delta);
    armR.current.rotation.x = damp(armR.current.rotation.x, aR, 12, delta);

    // head: thinking tilt + gentle sway
    head.current.rotation.z = damp(
      head.current.rotation.z,
      rt.state === 'thinking' ? 0.14 : 0,
      8,
      delta,
    );
    head.current.rotation.y =
      rt.state === 'idle' ? Math.sin(t * 0.6) * 0.18 : 0;

    // breathing
    const breathe = 1 + Math.sin(t * 1.8) * 0.015;
    torso.current.scale.set(1, breathe, 1);

    // status indicator colour (pulsing on error)
    if (indicatorMat.current) {
      tmpColor.current.set(statusColor(rt.state));
      const c = colorRef.current;
      c.r = damp(c.r, tmpColor.current.r, 10, delta);
      c.g = damp(c.g, tmpColor.current.g, 10, delta);
      c.b = damp(c.b, tmpColor.current.b, 10, delta);
      indicatorMat.current.emissive.setRGB(c.r, c.g, c.b);
      indicatorMat.current.emissiveIntensity =
        rt.state === 'error' ? 1.6 + Math.sin(t * 8) * 0.9 : 1.6;
    }
    if (cupRef.current) cupRef.current.visible = rt.state === 'coffee_break';
  });

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        selectAgent(agentId);
      }}
    >
      <group ref={body}>
        {/* legs (pivot at hip) */}
        <group ref={legL} position={[-0.11, 0.58, 0]}>
          <RoundedBox args={[0.17, 0.52, 0.19]} radius={0.06} position={[0, -0.26, 0]} castShadow>
            <meshStandardMaterial color={PANTS} roughness={0.85} />
          </RoundedBox>
        </group>
        <group ref={legR} position={[0.11, 0.58, 0]}>
          <RoundedBox args={[0.17, 0.52, 0.19]} radius={0.06} position={[0, -0.26, 0]} castShadow>
            <meshStandardMaterial color={PANTS} roughness={0.85} />
          </RoundedBox>
        </group>

        {/* torso */}
        <RoundedBox
          ref={torso}
          args={[0.54, 0.6, 0.3]}
          radius={0.09}
          position={[0, 1.02, 0]}
          castShadow
        >
          <meshStandardMaterial color={profile.color} roughness={0.75} />
        </RoundedBox>

        {/* arms (pivot at shoulder) */}
        <group ref={armL} position={[-0.345, 1.26, 0]}>
          <RoundedBox args={[0.14, 0.5, 0.16]} radius={0.06} position={[0, -0.24, 0]} castShadow>
            <meshStandardMaterial color={profile.color} roughness={0.8} />
          </RoundedBox>
        </group>
        <group ref={armR} position={[0.345, 1.26, 0]}>
          <RoundedBox args={[0.14, 0.5, 0.16]} radius={0.06} position={[0, -0.24, 0]} castShadow>
            <meshStandardMaterial color={profile.color} roughness={0.8} />
          </RoundedBox>
          {/* coffee cup at the hand, only on coffee_break */}
          <group ref={cupRef} position={[0, -0.5, 0.06]} visible={false}>
            <RoundedBox args={[0.09, 0.11, 0.09]} radius={0.03} castShadow>
              <meshStandardMaterial color="#f5f0e6" roughness={0.4} />
            </RoundedBox>
          </group>
        </group>

        {/* head */}
        <group ref={head} position={[0, 1.62, 0]}>
          <RoundedBox args={[0.36, 0.36, 0.34]} radius={0.1} castShadow>
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </RoundedBox>
          <RoundedBox args={[0.38, 0.16, 0.36]} radius={0.06} position={[0, 0.13, 0]} castShadow>
            <meshStandardMaterial color={hair} roughness={0.9} />
          </RoundedBox>
          {/* eyes */}
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0.01, 0.175]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#26221f" roughness={0.4} />
            </mesh>
          ))}
        </group>

        {/* status indicator */}
        <mesh position={[0, 1.98, 0]}>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshStandardMaterial
            ref={indicatorMat}
            color="#1f2937"
            emissive="#9ca3af"
            emissiveIntensity={1.6}
          />
        </mesh>
      </group>

      {/* name label */}
      {showLabels && (
      <Html
        position={[0, 2.18, 0]}
        center
        distanceFactor={18}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
        wrapperClass="avatar-label"
      >
        <div
          style={{
            background: 'rgba(20,14,8,0.55)',
            color: '#fff',
            borderRadius: 8,
            padding: '2px 10px',
            fontSize: 26,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
          }}
        >
          {profile.name}
        </div>
      </Html>
      )}

      {/* thought bubble */}
      {showLabels && state !== 'idle' && bubble ? (
        <Html
          position={[0, 2.62, 0]}
          center
          distanceFactor={18}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.94)',
              color: '#2b2118',
              borderRadius: 12,
              padding: '4px 12px',
              fontSize: 24,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              pointerEvents: 'none',
            }}
          >
            {bubble}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
