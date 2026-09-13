import { Op } from 'sequelize';
import { Errors } from '../../common/errors';
import { decodeCursor, encodeCursor } from '../../common/cursor';
import { logger } from '../../common/logger';
import { ConversationParticipant, Notification, User } from '../../db/models';
import { emitToUserRooms } from '../../realtime/bus';
import { toUserCard, type UserCard } from '../blocks/blocks.service';

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  actor: UserCard | null;
  conversationId: string | null;
  messageId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function toView(row: Notification): NotificationView {
  const actor = (row as unknown as { actor?: User | null }).actor ?? null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    actor: actor ? toUserCard(actor) : null,
    conversationId: row.conversationId,
    messageId: row.messageId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

// Called after a message commits (REST and socket flows share it).
// Best-effort by design: notification failures are logged, never fail sends.
export async function createMessageNotifications(args: {
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  preview: string;
}): Promise<void> {
  const members = await ConversationParticipant.findAll({
    where: { conversationId: args.conversationId, userId: { [Op.ne]: args.senderId } },
    attributes: ['userId'],
  });
  if (members.length === 0) return;
  const rows = await Notification.bulkCreate(
    members.map((m) => ({
      recipientId: m.userId,
      actorId: args.senderId,
      type: 'MESSAGE' as const,
      title: args.senderName,
      body: args.preview.slice(0, 280),
      conversationId: args.conversationId,
      messageId: args.messageId,
    })),
  );
  const full = await Notification.findAll({
    where: { id: { [Op.in]: rows.map((r) => r.id) } },
    include: [{ model: User, as: 'actor', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
  });
  for (const row of full) {
    emitToUserRooms([row.recipientId], 'notification:new', { notification: toView(row) });
  }
}

export async function listNotifications(
  recipientId: string,
  limit: number,
  cursor: string | undefined,
  unreadOnly: boolean,
): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
  const keyset = cursor ? decodeCursor(cursor) : null;
  const rows = await Notification.findAll({
    where: {
      recipientId,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(keyset
        ? {
            [Op.or]: [
              { createdAt: { [Op.lt]: keyset.createdAt } },
              { createdAt: keyset.createdAt, id: { [Op.lt]: keyset.id } },
            ],
          }
        : {}),
    },
    include: [{ model: User, as: 'actor', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map(toView),
    nextCursor:
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
        : null,
  };
}

export async function markNotificationsRead(recipientId: string, ids: string[]): Promise<{ updated: number }> {
  // Scoped to the requester: foreign ids are silently ignored (no oracle).
  const [updated] = await Notification.update(
    { readAt: new Date() },
    { where: { id: { [Op.in]: ids }, recipientId, readAt: null } },
  );
  return { updated };
}

export async function markAllNotificationsRead(recipientId: string): Promise<{ updated: number }> {
  const [updated] = await Notification.update(
    { readAt: new Date() },
    { where: { recipientId, readAt: null } },
  );
  return { updated };
}

export async function unreadNotificationCount(recipientId: string): Promise<{ count: number }> {
  const count = await Notification.count({ where: { recipientId, readAt: null } });
  return { count };
}

export async function dismissNotification(recipientId: string, id: string): Promise<void> {
  const deleted = await Notification.destroy({ where: { id, recipientId } });
  if (deleted === 0) throw Errors.notFound('Notification not found');
}

export function logNotificationFailure(err: unknown, context: object): void {
  logger.warn({ err: String(err), ...context }, 'Notification side-effect failed');
}
