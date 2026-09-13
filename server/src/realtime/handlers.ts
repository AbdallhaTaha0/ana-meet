import type { Server, Socket } from 'socket.io';
import { Op } from 'sequelize';
import { AppError } from '../common/errors';
import { ConversationParticipant } from '../db/models';
import { requireMembership } from '../modules/conversations/conversations.service';
import { assertNotBlocked } from '../modules/blocks/blocks.service';
import {
  advanceMessageStatus,
  deleteMessage,
  editMessage,
  sendMessage,
} from '../modules/messages/messages.service';
import { checkRateLimit } from '../redis/limits';
import { emitToUsers } from './emit';
import {
  messageDeleteSocketSchema,
  messageEditSocketSchema,
  messageSendSocketSchema,
  messageStatusSocketSchema,
  typingSocketSchema,
} from './socket.schemas';

// Per-user hot-path budgets (Redis-backed, shared across instances).
const LIMITS = {
  send: { max: 60, windowSeconds: 60 },
  edit: { max: 60, windowSeconds: 60 },
  status: { max: 120, windowSeconds: 60 },
  typing: { max: 60, windowSeconds: 60 },
} as const;

type Ack = (res: unknown) => void;

function toSocketError(err: unknown): { error: { code: string; message: string } } {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message } };
  }
  return { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
}

async function memberIds(conversationId: string): Promise<string[]> {
  const rows = await ConversationParticipant.findAll({
    where: { conversationId },
    attributes: ['userId'],
  });
  return rows.map((r) => r.userId);
}

// Typing (like sends and receipts) stops at DM blocks. Group typing stays
// permissive per the documented WhatsApp semantics.
async function assertTypingAllowed(userId: string, conversationId: string): Promise<void> {
  const { conversation } = await requireMembership(userId, conversationId);
  if (conversation.type !== 'DIRECT') return;
  const peer = await ConversationParticipant.findOne({
    where: { conversationId, userId: { [Op.ne]: userId } },
    attributes: ['userId'],
  });
  if (peer) await assertNotBlocked(userId, peer.userId);
}

export function registerMessagingHandlers(io: Server, socket: Socket): void {
  const userId = socket.data.userId as string;
  const role = socket.data.role as string;
  const respond = (ack: unknown, payload: unknown): void => {
    if (typeof ack === 'function') (ack as Ack)(payload);
  };

  // Durable flow: validate → authorize → persist PostgreSQL → emit.
  // The ack confirms persistence; `created: false` marks a deduped retry.
  socket.on('message:send', async (payload: unknown, ack?: Ack) => {
    const limited = await checkRateLimit(`rl:sock:send:${userId}`, LIMITS.send.max, LIMITS.send.windowSeconds);
    if (!limited.allowed) {
      respond(ack, { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } });
      return;
    }
    const parsed = messageSendSocketSchema.safeParse(payload);
    if (!parsed.success) {
      respond(ack, { error: { code: 'BAD_REQUEST', message: 'Invalid payload' } });
      return;
    }
    try {
      const { message, created } = await sendMessage(
        userId,
        parsed.data.conversationId,
        parsed.data.message,
      );
      emitToUsers(io, await memberIds(parsed.data.conversationId), 'message:new', { message });
      respond(ack, { ok: true, message, created });
    } catch (err) {
      respond(ack, toSocketError(err));
    }
  });

  socket.on('message:edit', async (payload: unknown, ack?: Ack) => {
    const limited = await checkRateLimit(`rl:sock:edit:${userId}`, LIMITS.edit.max, LIMITS.edit.windowSeconds);
    if (!limited.allowed) {
      respond(ack, { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } });
      return;
    }
    const parsed = messageEditSocketSchema.safeParse(payload);
    if (!parsed.success) {
      respond(ack, { error: { code: 'BAD_REQUEST', message: 'Invalid payload' } });
      return;
    }
    try {
      const message = await editMessage(
        userId,
        parsed.data.conversationId,
        parsed.data.messageId,
        parsed.data.content,
      );
      emitToUsers(io, await memberIds(parsed.data.conversationId), 'message:updated', { message });
      respond(ack, { ok: true, message });
    } catch (err) {
      respond(ack, toSocketError(err));
    }
  });

  socket.on('message:delete', async (payload: unknown, ack?: Ack) => {
    const limited = await checkRateLimit(`rl:sock:edit:${userId}`, LIMITS.edit.max, LIMITS.edit.windowSeconds);
    if (!limited.allowed) {
      respond(ack, { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } });
      return;
    }
    const parsed = messageDeleteSocketSchema.safeParse(payload);
    if (!parsed.success) {
      respond(ack, { error: { code: 'BAD_REQUEST', message: 'Invalid payload' } });
      return;
    }
    try {
      await deleteMessage(userId, role, parsed.data.conversationId, parsed.data.messageId);
      emitToUsers(io, await memberIds(parsed.data.conversationId), 'message:deleted', {
        conversationId: parsed.data.conversationId,
        messageId: parsed.data.messageId,
      });
      respond(ack, { ok: true });
    } catch (err) {
      respond(ack, toSocketError(err));
    }
  });

  socket.on('message:delivered', async (payload: unknown, ack?: Ack) => {
    await handleStatus(io, socket, payload, ack, 'DELIVERED');
  });

  socket.on('message:read', async (payload: unknown, ack?: Ack) => {
    await handleStatus(io, socket, payload, ack, 'READ');
  });

  // Ephemeral: validated + authorized, never persisted.
  const handleTyping = (typing: boolean) => async (payload: unknown, ack?: Ack) => {
    const limited = await checkRateLimit(
      `rl:sock:typing:${userId}`,
      LIMITS.typing.max,
      LIMITS.typing.windowSeconds,
    );
    if (!limited.allowed) {
      respond(ack, { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } });
      return;
    }
    const parsed = typingSocketSchema.safeParse(payload);
    if (!parsed.success) {
      respond(ack, { error: { code: 'BAD_REQUEST', message: 'Invalid payload' } });
      return;
    }
    try {
      await assertTypingAllowed(userId, parsed.data.conversationId);
      const others = (await memberIds(parsed.data.conversationId)).filter((id) => id !== userId);
      emitToUsers(io, others, 'typing:update', {
        conversationId: parsed.data.conversationId,
        userId,
        typing,
      });
      respond(ack, { ok: true });
    } catch (err) {
      respond(ack, toSocketError(err));
    }
  };
  socket.on('typing:start', handleTyping(true));
  socket.on('typing:stop', handleTyping(false));
}

async function handleStatus(
  io: Server,
  socket: Socket,
  payload: unknown,
  ack: unknown,
  status: 'DELIVERED' | 'READ',
): Promise<void> {
  const userId = socket.data.userId as string;
  const respond = (p: unknown): void => {
    if (typeof ack === 'function') (ack as Ack)(p);
  };
  const limited = await checkRateLimit(
    `rl:sock:status:${userId}`,
    LIMITS.status.max,
    LIMITS.status.windowSeconds,
  );
  if (!limited.allowed) {
    respond({ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } });
    return;
  }
  const parsed = messageStatusSocketSchema.safeParse({ ...(payload as object), status });
  if (!parsed.success) {
    respond({ error: { code: 'BAD_REQUEST', message: 'Invalid payload' } });
    return;
  }
  try {
    const message = await advanceMessageStatus(
      userId,
      parsed.data.conversationId,
      parsed.data.messageId,
      status,
    );
    emitToUsers(io, await memberIds(parsed.data.conversationId), 'message:status', {
      conversationId: parsed.data.conversationId,
      messageId: message.id,
      status: message.status,
    });
    respond({ ok: true, message });
  } catch (err) {
    if (err instanceof AppError) respond({ error: { code: err.code, message: err.message } });
    else respond({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}
