import type { Server } from 'socket.io';

// Delivery fabric: every socket joins its owner's `user:{id}` room at
// connect time, so emitting to that room reaches ALL of the user's
// devices/tabs on EVERY Node instance (via the Redis adapter) with no
// conversation-room bookkeeping and no stale-room bugs.
export function emitToUsers(io: Server, userIds: string[], event: string, payload: unknown): void {
  for (const id of new Set(userIds)) {
    io.to(`user:${id}`).emit(event, payload);
  }
}
