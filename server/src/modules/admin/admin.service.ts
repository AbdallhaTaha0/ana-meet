import { randomBytes } from 'crypto';
import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { Errors } from '../../common/errors';
import { hashPassword } from '../../common/password';
import {
  AdminAuditLog,
  Block,
  Contact,
  Conversation,
  ConversationParticipant,
  Message,
  Notification,
  RefreshSession,
  Story,
  User,
} from '../../db/models';
import { getSequelize } from '../../db/sequelize';
import { disconnectUserSockets, emitToUserRooms } from '../../realtime/bus';
import { generateUniquePublicId } from '../auth/auth.service';
import { toUserCard, type UserCard } from '../blocks/blocks.service';

export interface ProvisionedBot {
  bot: UserCard & { email: string; role: string };
  // Returned ONCE at provisioning; never stored, never returned again.
  initialPassword: string;
}

export interface AuditView {
  id: string;
  admin: UserCard | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export async function recordAudit(
  adminId: string,
  action: string,
  target: { targetType?: string; targetId?: string; metadata?: Record<string, unknown> },
  tx?: Transaction,
): Promise<void> {
  await AdminAuditLog.create(
    {
      adminId,
      action,
      targetType: target.targetType ?? null,
      targetId: target.targetId ?? null,
      metadata: target.metadata ?? null,
    },
    { transaction: tx },
  );
}

function generateBotPassword(): string {
  // 24 URL-safe characters; the operator must store it securely.
  return randomBytes(18).toString('base64url');
}

export async function provisionBot(
  adminId: string,
  input: { username: string; email: string; displayName: string },
): Promise<ProvisionedBot> {
  const existing = await User.findOne({
    where: { [Op.or]: [{ username: input.username }, { email: input.email }] },
    attributes: ['id'],
  });
  if (existing) throw Errors.conflict('Username or email is already taken');

  const initialPassword = generateBotPassword();
  const sequelize = getSequelize();
  const bot = await sequelize.transaction(async (tx) => {
    let created;
    try {
      created = await User.create(
        {
          username: input.username,
          email: input.email,
          passwordHash: await hashPassword(initialPassword),
          displayName: input.displayName,
          publicId: await generateUniquePublicId(),
          role: 'BOT',
          status: 'ACTIVE',
        },
        { transaction: tx },
      );
    } catch (err) {
      // Lost race with a concurrent provision: same contract as the check.
      if (err instanceof UniqueConstraintError) {
        throw Errors.conflict('Username or email is already taken');
      }
      throw err;
    }
    await recordAudit(
      adminId,
      'bot.create',
      { targetType: 'user', targetId: created.id, metadata: { username: created.username } },
      tx,
    );
    return created;
  });

  return {
    bot: { ...toUserCard(bot), email: bot.email, role: bot.role },
    initialPassword,
  };
}

export async function sendAnnouncement(
  adminId: string,
  input: { title: string; body: string; userIds: string[] },
): Promise<{ sent: number }> {
  const unique = [...new Set(input.userIds)];
  const recipients = await User.findAll({
    where: { id: { [Op.in]: unique }, status: 'ACTIVE' },
    attributes: ['id'],
  });
  if (recipients.length !== unique.length) {
    // Atomic: unknown/disabled recipients abort the whole announcement.
    throw Errors.notFound('One or more recipients were not found');
  }

  const sequelize = getSequelize();
  const rows = await sequelize.transaction(async (tx) => {
    const created = await Notification.bulkCreate(
      unique.map((recipientId) => ({
        recipientId,
        actorId: adminId,
        type: 'SYSTEM' as const,
        title: input.title,
        body: input.body,
        conversationId: null,
        messageId: null,
      })),
      { transaction: tx },
    );
    await recordAudit(
      adminId,
      'announcement.send',
      {
        metadata: { title: input.title, recipientCount: unique.length },
      },
      tx,
    );
    return created;
  });

  for (const row of rows) {
    emitToUserRooms([row.recipientId], 'notification:new', {
      notification: {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        actor: null, // Resolved lazily by clients via /users/:id if needed.
        conversationId: null,
        messageId: null,
        readAt: null,
        createdAt: row.createdAt,
      },
    });
  }
  return { sent: rows.length };
}

export async function listAuditLog(
  limit: number,
  offset: number,
): Promise<{ items: AuditView[]; total: number }> {
  const { rows, count } = await AdminAuditLog.findAndCountAll({
    include: [{ model: User, as: 'admin', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return {
    items: rows.map((row) => {
      const admin = (row as unknown as { admin?: User | null }).admin ?? null;
      return {
        id: row.id,
        admin: admin ? toUserCard(admin) : null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt,
      };
    }),
    total: count,
  };
}

// --- User management ---

export interface AdminUserView {
  id: string;
  username: string;
  email: string;
  displayName: string;
  publicId: string;
  role: string;
  status: string;
  createdAt: Date;
}

function toAdminUserView(user: User): AdminUserView {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    publicId: user.publicId,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listUsers(
  filters: { search?: string; status?: 'ACTIVE' | 'DISABLED'; role?: 'USER' | 'BOT' | 'ADMIN' },
  limit: number,
  offset: number,
): Promise<{ items: AdminUserView[]; total: number }> {
  const term = filters.search?.trim();
  const { rows, count } = await User.findAndCountAll({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(term
        ? {
            [Op.or]: [
              { username: { [Op.iLike]: `${escapeLike(term.toLowerCase())}%` } },
              { email: { [Op.iLike]: `${escapeLike(term.toLowerCase())}%` } },
              { displayName: { [Op.iLike]: `%${escapeLike(term)}%` } },
            ],
          }
        : {}),
    },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { items: rows.map(toAdminUserView), total: count };
}

export async function getUserDetail(id: string): Promise<{
  user: AdminUserView;
  stats: {
    conversations: number;
    messagesSent: number;
    contacts: number;
    stories: number;
    activeSessions: number;
  };
}> {
  const user = await User.findByPk(id);
  if (!user) throw Errors.notFound('User not found');
  const [conversations, messagesSent, contacts, stories, activeSessions] = await Promise.all([
    ConversationParticipant.count({ where: { userId: id } }),
    Message.count({ where: { senderId: id } }),
    Contact.count({ where: { userId: id } }),
    Story.count({ where: { ownerId: id } }),
    RefreshSession.count({ where: { userId: id, revokedAt: null } }),
  ]);
  return {
    user: toAdminUserView(user),
    stats: { conversations, messagesSent, contacts, stories, activeSessions },
  };
}

export async function disableUser(adminId: string, id: string): Promise<AdminUserView> {
  if (adminId === id) throw Errors.badRequest('You cannot disable your own account');
  const sequelize = getSequelize();
  const user = await sequelize.transaction(async (tx) => {
    const target = await User.findByPk(id, { transaction: tx, lock: tx.LOCK.UPDATE });
    if (!target) throw Errors.notFound('User not found');
    target.status = 'DISABLED';
    await target.save({ transaction: tx });
    // Force logout everywhere: outstanding tokens stop working immediately.
    await RefreshSession.update(
      { revokedAt: new Date() },
      { where: { userId: id, revokedAt: null }, transaction: tx },
    );
    await recordAudit(
      adminId,
      'user.disable',
      { targetType: 'user', targetId: id, metadata: { username: target.username } },
      tx,
    );
    return target;
  });
  // Live sockets would otherwise survive on unexpired access JWTs.
  disconnectUserSockets([id]);
  return toAdminUserView(user);
}

export async function restoreUser(adminId: string, id: string): Promise<AdminUserView> {
  const target = await User.findByPk(id);
  if (!target) throw Errors.notFound('User not found');
  target.status = 'ACTIVE';
  await target.save();
  await recordAudit(adminId, 'user.restore', {
    targetType: 'user',
    targetId: id,
    metadata: { username: target.username },
  });
  // Sessions stay revoked: the user must log in again. Documented behavior.
  return toAdminUserView(target);
}

export async function deleteUser(adminId: string, id: string): Promise<void> {
  if (adminId === id) throw Errors.badRequest('You cannot delete your own account');
  const sequelize = getSequelize();
  // Immediate permanent deletion (no grace period, per product rules).
  // Dependent rows resolve via FKs: memberships/sessions/stories/recipient
  // notifications CASCADE; message senders, notification actors, conversation
  // creators, and audit authors SET NULL (peer history is preserved).
  await sequelize.transaction(async (tx) => {
    const target = await User.findByPk(id, { transaction: tx, lock: tx.LOCK.UPDATE });
    if (!target) throw Errors.notFound('User not found');
    await recordAudit(
      adminId,
      'user.delete',
      { targetType: 'user', targetId: id, metadata: { username: target.username } },
      tx,
    );
    // Bidirectional relations have no CASCADE pair to cascade from.
    await Contact.destroy({
      where: { [Op.or]: [{ userId: id }, { contactUserId: id }] },
      transaction: tx,
    });
    await Block.destroy({
      where: { [Op.or]: [{ blockerId: id }, { blockedUserId: id }] },
      transaction: tx,
    });
    await target.destroy({ transaction: tx });
  });
  // After commit: outstanding JWTs fail the per-request account lookup, and
  // live sockets are dropped here so nothing keeps operating.
  disconnectUserSockets([id]);
}

export async function platformStats(): Promise<{
  users: { total: number; active: number; disabled: number; bots: number; admins: number };
  conversations: { total: number; direct: number; group: number };
  messages: { total: number };
  stories: { active: number };
  notifications: { total: number; unread: number };
}> {
  const [
    userTotal,
    userActive,
    userDisabled,
    bots,
    admins,
    convoTotal,
    convoDirect,
    convoGroup,
    messages,
    stories,
    notifTotal,
    notifUnread,
  ] = await Promise.all([
    User.count(),
    User.count({ where: { status: 'ACTIVE' } }),
    User.count({ where: { status: 'DISABLED' } }),
    User.count({ where: { role: 'BOT', status: 'ACTIVE' } }),
    User.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
    Conversation.count(),
    Conversation.count({ where: { type: 'DIRECT' } }),
    Conversation.count({ where: { type: 'GROUP' } }),
    Message.count(),
    Story.count({ where: { expiresAt: { [Op.gt]: new Date() } } }),
    Notification.count(),
    Notification.count({ where: { readAt: null } }),
  ]);
  return {
    users: { total: userTotal, active: userActive, disabled: userDisabled, bots, admins },
    conversations: { total: convoTotal, direct: convoDirect, group: convoGroup },
    messages: { total: messages },
    stories: { active: stories },
    notifications: { total: notifTotal, unread: notifUnread },
  };
}
