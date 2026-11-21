/**
 * Socket bridge (Phase 2) — connects the local simulation to the server.
 *
 * Server `agent:state_change` events are applied to the simulation via the
 * Visual Mapping Law (simulation.applyExternalEvent). Connection state is
 * mirrored into the store, which flips the UI between LIVE_MODE and
 * DEMO_MODE. Idempotent: a second init call is a no-op.
 */
import { io, type Socket } from 'socket.io-client';
import {
  AGENT_STATE_CHANGE_EVENT,
  WORLD_OBJECTS_CHANGED_EVENT,
  type WorldEvent,
  type WorldObjectPayload,
} from '@living-world/shared';
import { simulation } from './simulation';
import { useWorldStore } from '../store/useWorldStore';
import { useDataStore } from '../store/useDataStore';

let socket: Socket | null = null;

export function initSocketBridge(): void {
  if (socket) return;
  const url =
    (import.meta as any).env?.VITE_SERVER_URL ?? 'http://localhost:4000';
  socket = io(url, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: Infinity,
  });
  socket.on('connect', () => {
    useWorldStore.getState().setServerConnected(true);
  });
  socket.on('disconnect', () => {
    useWorldStore.getState().setServerConnected(false);
  });
  socket.on('connect_error', () => {
    useWorldStore.getState().setServerConnected(false);
  });
  socket.on(AGENT_STATE_CHANGE_EVENT, (payload: unknown) => {
    simulation.applyExternalEvent(payload as WorldEvent);
  });
  // Phase 4: world-object changes (Build Mode in any client) — take the
  // broadcast list as truth and rebuild the pathfinding grids from it.
  socket.on(WORLD_OBJECTS_CHANGED_EVENT, (payload: unknown) => {
    const objects = (payload as { objects?: WorldObjectPayload[] })?.objects;
    if (Array.isArray(objects)) {
      useDataStore.setState({ worldObjects: objects });
      simulation.setDynamicObjects(objects);
    }
  });
}

export function disposeSocketBridge(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  useWorldStore.getState().setServerConnected(false);
}
