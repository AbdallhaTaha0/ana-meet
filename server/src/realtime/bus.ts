import type { Server } from 'socket.io';

// Dependency-inverted real-time bus: domain services emit without importing
// the socket server (which would create import cycles — handlers import
// services, never the reverse). Set once at boot; a no-op until then so
// services stay usable in tests without a listening server.
let io: Server | null = null;

export function setSocketServer(server: Server | null): void {
  io = server;
}

export function emitToUserRooms(userIds: string[], event: string, payload: unknown): void {
  if (!io) return;
  for (const id of new Set(userIds)) {
    io.to(`user:${id}`).emit(event, payload);
  }
}

// Actively drops every socket of the given users on every instance.
// Used when an account is disabled or permanently deleted so stale
// connections (whose JWTs have not expired yet) cannot keep operating.
export function disconnectUserSockets(userIds: string[]): void {
  if (!io) return;
  for (const id of new Set(userIds)) {
    io.in(`user:${id}`).disconnectSockets(true);
  }
}
