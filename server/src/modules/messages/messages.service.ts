import { Op, UniqueConstraintError } from 'sequelize';
import { Errors } from '../../common/errors';
import { decodeCursor, encodeCursor } from '../../common/cursor';
import { Conversation, ConversationParticipant, Message, Notification, User, type MessageStatus } from '../../db/models';
import { getSequelize } from '../../db/sequelize';
import { requireMembership } from '../conversations/conversations.service';
import { assertNotBlocked, toUserCard, type UserCard } from '../blocks/blocks.service';
import { assertOwnUploadReference } from '../uploads/uploads.access';
import {
  createMessageNotifications,
  logNotificationFailure,
} from '../notifications/notifications.service';
import type { SendMessageInput } from './messages.schemas';

export interface ReplyPreview {
  id: string;
  sender: UserCard | null;
  snippet: string;
  deleted: boolean;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string | null;
  sender: UserCard | null;
  type: string;
  content: string | null;
  media: { url: string; mimeType: string; sizeBytes: number; fileName: string | null } | null;
  replyToMessageId: string | null;
  replyTo: ReplyPreview | null;
  clientMessageId: string;
  status: MessageStatus;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const STATUS_RANK: Record<MessageStatus, number> = { SENT: 0, DELIVERED: 1, READ: 2 };

function snippetOf(message: Message): string {
  if (message.content) return message.content.slice(0, 140);
  if (message.mediaUrl) return `[${message.type.toLowerCase()}]`;
  return '';
}

function toView(message: Message, replyMap: Map<string, Message>): MessageView {
  const sender = (message as unknown as { sender?: User | null }).sender ?? null;
  let replyTo: ReplyPreview | null = null;
  if (message.replyToMessageId) {
    const parent = replyMap.get(message.replyToMessageId);
    if (parent) {
      const parentSender = (parent as unknown as { sender?: User | null }).sender ?? null;
      replyTo = {
        id: parent.id,
        sender: parentSender ? toUserCard(parentSender) : null,
        snippet: snippetOf(parent),
        deleted: false,
      };
    } else {
      // Parent hard-deleted (replyTo SET NULL would clear the id, so this
      // branch is defensive only).
      replyTo = { id: message.replyToMessageId, sender: null, snippet: '', deleted: true };
    }
  }
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    sender: sender ? toUserCard(sender) : null,
    type: message.type,
    content: message.content,
    media:
      message.mediaUrl && message.mimeType && message.sizeBytes !== null
        ? {
            url: message.mediaUrl,
            mimeType: message.mimeType,
            sizeBytes: Number(message.sizeBytes),
            fileName: message.fileName,
          }
        : null,
    replyToMessageId: message.replyToMessageId,
    replyTo,
    clientMessageId: message.clientMessageId,
    status: message.status,
    editedAt: message.editedAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

async function loadReplyMap(messages: Message[]): Promise<Map<string, Message>> {
  const ids = [...new Set(messages.map((m) => m.replyToMessageId).filter(Boolean))] as string[];
  if (ids.length === 0) return new Map();
  const parents = await Message.findAll({
    where: { id: { [Op.in]: ids } },
    include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
  });
  return new Map(parents.map((p) => [p.id, p]));
}

async function reloadView(id: string): Promise<MessageView> {
  const message = await Message.findByPk(id, {
    include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
  });
  if (!message) throw Errors.notFound('Message not found');
  return toView(message, await loadReplyMap([message]));
}

// --- Send (REST now; Socket.IO `message:send` reuses this in Phase 6) ---

export async function sendMessage(
  senderId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<{ message: MessageView; created: boolean }> {
  const { conversation } = await requireMembership(senderId, conversationId);

  if (conversation.type === 'DIRECT') {
    // Group semantics intentionally differ (see docs): blocks between
    // members do not stop group messages, but a DM across a block is refused.
    const peer = await ConversationParticipant.findOne({
      where: { conversationId, userId: { [Op.ne]: senderId } },
      attributes: ['userId'],
    });
    if (peer) await assertNotBlocked(senderId, peer.userId);
  }

  if (input.replyToMessageId) {
    const parent = await Message.findByPk(input.replyToMessageId, {
      attributes: ['id', 'conversationId'],
    });
    if (!parent) throw Errors.notFound('Replied message not found');
    if (parent.conversationId !== conversationId) {
      throw Errors.badRequest('Replies must target a message in the same conversation');
    }
  }
  if (input.type !== 'TEXT') {
    await assertOwnUploadReference(senderId, input.mediaUrl, input.mimeType, input.sizeBytes);
  }

  // Idempotency: a retried send carries the same clientMessageId and
  // resolves to the original row instead of duplicating.
  const existing = await Message.findOne({
    where: { conversationId, clientMessageId: input.clientMessageId },
    attributes: ['id'],
  });
  if (existing) return { message: await reloadView(existing.id), created: false };

  const payload = {
    conversationId,
    senderId,
    type: input.type,
    content: input.type === 'TEXT' ? input.content : null,
    mediaUrl: input.type === 'TEXT' ? null : input.mediaUrl,
    mimeType: input.type === 'TEXT' ? null : input.mimeType,
    sizeBytes: input.type === 'TEXT' ? null : input.sizeBytes,
    fileName: input.type === 'TEXT' ? null : (input.fileName ?? null),
    replyToMessageId: input.replyToMessageId ?? null,
    clientMessageId: input.clientMessageId,
  };

  try {
    const created = await getSequelize().transaction(async (transaction) => {
      const message = await Message.create(payload, { transaction });
      await getSequelize().query(
        "UPDATE conversations SET updated_at = GREATEST(updated_at + INTERVAL '1 millisecond', CURRENT_TIMESTAMP) WHERE id = :conversationId",
        { replacements: { conversationId }, transaction },
      );
      // New activity reopens closed chats for every member.
      await ConversationParticipant.update(
        { hidden: false },
        { where: { conversationId }, transaction },
      );
      return message;
    });
    const view = await reloadView(created.id);
    // Durable fan-out (DB + real-time) for every member except the sender.
    // Best-effort: a notification failure is logged, never fails the send.
    const senderName = view.sender?.displayName ?? 'Someone';
    const preview =
      view.content ?? (view.media ? `[${view.type.toLowerCase()}]` : 'New message');
    await createMessageNotifications({
      conversationId,
      messageId: created.id,
      senderId,
      senderName,
      preview,
    }).catch((err: unknown) =>
      logNotificationFailure(err, { conversationId, messageId: created.id }),
    );
    return { message: view, created: true };
  } catch (err) {
    // Lost race with a concurrent retry: fetch the winner instead of 500ing.
    if (err instanceof UniqueConstraintError) {
      const winner = await Message.findOne({
        where: { conversationId, clientMessageId: input.clientMessageId },
        attributes: ['id'],
      });
      if (winner) return { message: await reloadView(winner.id), created: false };
    }
    throw err;
  }
}

// --- History (cursor/keyset pagination, newest first) ---

export async function listMessages(
  userId: string,
  conversationId: string,
  limit: number,
  cursor?: string,
): Promise<{ items: MessageView[]; nextCursor: string | null }> {
  await requireMembership(userId, conversationId);

  const keyset = cursor ? decodeCursor(cursor) : null;
  const rows = await Message.findAll({
    where: {
      conversationId,
      ...(keyset
        ? {
            [Op.or]: [
              { createdAt: { [Op.lt]: keyset.createdAt } },
              { createdAt: keyset.createdAt, id: { [Op.lt]: keyset.id } },
            ],
          }
        : {}),
    },
    include: [{ model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const replyMap = await loadReplyMap(page);
  return {
    items: page.map((m) => toView(m, replyMap)),
    nextCursor:
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
        : null,
  };
}

// --- Edit / Delete ---

async function requireMessageInConversation(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<{ message: Message; conversation: Conversation }> {
  const { conversation } = await requireMembership(userId, conversationId);
  const message = await Message.findByPk(messageId);
  if (!message || message.conversationId !== conversationId) {
    throw Errors.notFound('Message not found');
  }
  return { message, conversation };
}

export async function editMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
): Promise<MessageView> {
  const { message } = await requireMessageInConversation(userId, conversationId, messageId);
  if (message.senderId !== userId) throw Errors.forbidden('Only the sender can edit a message');
  if (message.type !== 'TEXT') throw Errors.badRequest('Only text messages can be edited');
  message.content = content;
  message.editedAt = new Date();
  await message.save();
  return reloadView(message.id);
}

export async function deleteMessage(
  userId: string,
  role: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const { message } = await requireMessageInConversation(userId, conversationId, messageId);
  // Owner deletes own; platform admins may delete anything. Group roles do
  // NOT grant message deletion in V1 (explicit product decision).
  if (message.senderId !== userId && role !== 'ADMIN') {
    throw Errors.forbidden('Only the sender can delete a message');
  }
  await message.destroy();
}

// --- Status (monotonic SENT → DELIVERED → READ) ---

export async function advanceMessageStatus(
  userId: string,
  conversationId: string,
  messageId: string,
  status: MessageStatus,
): Promise<MessageView> {
  const { message, conversation } = await requireMessageInConversation(
    userId,
    conversationId,
    messageId,
  );
  if (conversation.type === 'DIRECT') {
    // Read/delivery receipts leak activity: refused across DM blocks,
    // mirroring send and typing enforcement.
    const peer = await ConversationParticipant.findOne({
      where: { conversationId, userId: { [Op.ne]: userId } },
      attributes: ['userId'],
    });
    if (peer) await assertNotBlocked(userId, peer.userId);
  }
  if (STATUS_RANK[status] < STATUS_RANK[message.status]) {
    throw Errors.badRequest('Message status cannot move backwards');
  }
  if (STATUS_RANK[status] > STATUS_RANK[message.status]) {
    message.status = status;
    await message.save();
  }
  if (status === 'READ') {
    // Viewing the chat clears the stack: the reader's MESSAGE notifications
    // for this message are marked read best-effort, never failing the receipt.
    try {
      await Notification.update(
        { readAt: new Date() },
        { where: { recipientId: userId, messageId: message.id, readAt: null } },
      );
    } catch {
      // Best-effort only.
    }
  }
  return reloadView(message.id);
}
