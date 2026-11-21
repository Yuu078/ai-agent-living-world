/**
 * Socket.IO realtime hub.
 *
 * Holds the single Socket.IO server instance attached to the Fastify
 * HTTP server. `emitStateChange` broadcasts the Section 5 contract
 * event (`agent:state_change`) to every connected client.
 */
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { WorldEvent } from '@living-world/shared';

// Mirror of AGENT_STATE_CHANGE_EVENT in shared/types.ts (runtime const
// is duplicated locally because the server imports shared types only).
export const AGENT_STATE_CHANGE_EVENT = 'agent:state_change';

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });
  io.on('connection', (socket: Socket) => {
    console.log(`[realtime] client connected: ${socket.id}`);
    socket.on('disconnect', (reason: string) => {
      console.log(`[realtime] client disconnected: ${socket.id} (${reason})`);
    });
  });
  return io;
}

export function getRealtime(): Server | null {
  return io;
}

/** Broadcast a world event to all connected clients (no-op pre-init). */
export function emitStateChange(event: WorldEvent): void {
  io?.emit(AGENT_STATE_CHANGE_EVENT, event);
}
