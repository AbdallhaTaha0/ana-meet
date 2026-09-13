import { z } from 'zod';
import { Errors } from './errors';

// Opaque keyset cursors: base64url({ t: ISO timestamp, id: uuid }).
// Shared by every newest-first paginated listing (messages, notifications).
const cursorSchema = z.object({
  t: z.string().datetime(),
  id: z.string().uuid(),
});

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), id })).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw Errors.badRequest('Invalid pagination cursor');
  }
  const result = cursorSchema.safeParse(parsed);
  if (!result.success) throw Errors.badRequest('Invalid pagination cursor');
  return { createdAt: new Date(result.data.t), id: result.data.id };
}
