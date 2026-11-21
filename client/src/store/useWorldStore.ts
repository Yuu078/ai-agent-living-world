import { create } from 'zustand';
import type {
  AppMode,
  CameraPreset,
  FloorId,
  QualityPreset,
} from '@living-world/shared';
import type { AgentView } from '../engine/simulation';

/**
 * UI state for the Living World.
 *
 * Phase 1 runs fully local in DEMO_MODE: agent views are mirrored from the
 * local lifeSim simulation. Phase 2 syncs this store with the server over
 * Socket.IO (`agent:state_change`): while the server is connected the mode
 * is LIVE_MODE, otherwise the local lifeSim keeps running in DEMO_MODE.
 */
interface WorldStore {
  /** LIVE_MODE while the Phase 2 server is connected, else DEMO_MODE. */
  mode: AppMode;
  serverConnected: boolean;
  setServerConnected: (v: boolean) => void;
  speed: 1 | 2 | 4;
  setSpeed: (s: 1 | 2 | 4) => void;
  cameraPreset: CameraPreset;
  setCameraPreset: (p: CameraPreset) => void;
  followAgentId: string | null;
  setFollowAgent: (id: string | null) => void;
  cutaway: boolean;
  setCutaway: (v: boolean) => void;
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  /** Phase 4: which floor the scene is showing. */
  activeFloor: FloorId;
  setActiveFloor: (f: FloorId) => void;
  /** Phase 4: Build Mode (furniture placement) on/off. */
  buildMode: boolean;
  setBuildMode: (v: boolean) => void;
  /** Phase 4: rendering quality preset. */
  quality: QualityPreset;
  setQuality: (q: QualityPreset) => void;
  /** Phase 4: guest crowd (instanced agents) on/off. */
  crowdEnabled: boolean;
  setCrowdEnabled: (v: boolean) => void;
  /** Phase 4: measured render FPS (1 Hz). */
  fps: number;
  setFps: (fps: number) => void;
  agentViews: Record<string, AgentView>;
  syncAgentView: (id: string, view: AgentView) => void;
  /** World clock: sim minutes elapsed since mount (drives TopBar clock). */
  clockMinutes: number;
  tickClock: (minutes: number) => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  mode: 'DEMO_MODE',
  serverConnected: false,
  setServerConnected: (v) =>
    set({ serverConnected: v, mode: v ? 'LIVE_MODE' : 'DEMO_MODE' }),
  speed: 1,
  setSpeed: (speed) => set({ speed }),
  cameraPreset: 'isometric',
  setCameraPreset: (cameraPreset) =>
    set((s) => ({
      cameraPreset,
      followAgentId: cameraPreset === 'follow' ? (s.followAgentId ?? s.selectedAgentId) : s.followAgentId,
      // Isometric & top-down look INTO the building: force the cutaway on so
      // the roof/walls never hide the interior. Orbit & follow keep whatever
      // the user toggled (they are the exterior-view presets).
      cutaway:
        cameraPreset === 'isometric' || cameraPreset === 'top' ? true : s.cutaway,
    })),
  followAgentId: null,
  setFollowAgent: (followAgentId) => set({ followAgentId }),
  // Default ON: the app opens on the isometric preset, and the first thing
  // the user must see is the interior + avatars — not the roof.
  cutaway: true,
  setCutaway: (cutaway) => set({ cutaway }),
  selectedAgentId: null,
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  activeFloor: 1,
  setActiveFloor: (activeFloor) => set({ activeFloor }),
  buildMode: false,
  setBuildMode: (buildMode) => set({ buildMode }),
  quality: 'auto',
  setQuality: (quality) => set({ quality }),
  crowdEnabled: false,
  setCrowdEnabled: (crowdEnabled) => set({ crowdEnabled }),
  fps: 0,
  setFps: (fps) => set({ fps }),
  agentViews: {},
  syncAgentView: (id, view) =>
    set((s) => {
      const prev = s.agentViews[id];
      if (
        prev &&
        prev.state === view.state &&
        prev.zone === view.zone &&
        prev.thoughtBubble === view.thoughtBubble &&
        prev.floor === view.floor
      ) {
        return s;
      }
      return { agentViews: { ...s.agentViews, [id]: view } };
    }),
  clockMinutes: 9 * 60, // office opens at 09:00
  tickClock: (minutes) => set((s) => ({ clockMinutes: s.clockMinutes + minutes })),
}));
