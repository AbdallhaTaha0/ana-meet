import { Op, Transaction, UniqueConstraintError } from 'sequelize';
import { Errors } from '../../common/errors';
import {
  Conversation,
  ConversationParticipant,
  Notification,
  User,
  type ParticipantRole,
} from '../../db/models';
import { getSequelize } from '../../db/sequelize';
import { emitToUserRooms } from '../../realtime/bus';
import {
  assertNotBlocked,
  toUserCard,
  type UserCard,
} from '../blocks/blocks.service';

export const GROUP_MAX_MEMBERS = 200;

async function currentMemberIds(conversationId: string): Promise<string[]> {
  const rows = await ConversationParticipant.findAll({
    where: { conversationId },
    attributes: ['userId'],
  });
  return rows.map((r) => r.userId);
}

export interface ParticipantView {
  userId: string;
  role: ParticipantRole;
  user: UserCard | null;
  joinedAt: Date;
}

export interface ConversationDetail {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  peer: UserCard | null;
  memberCount: number;
  myRole: ParticipantRole;
  muted: boolean;
  participants: ParticipantView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationSummary {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  peer: UserCard | null;
  memberCount: number;
  myRole: ParticipantRole;
  muted: boolean;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toParticipantView(row: ConversationParticipant): ParticipantView {
  const user = (row as unknown as { user?: User | null }).user ?? null;
  return {
    userId: row.userId,
    role: row.role,
    user: user ? toUserCard(user) : null,
    joinedAt: row.createdAt,
  };
}

function toDetail(
  conversation: Conversation,
  participants: ConversationParticipant[],
  myRole: ParticipantRole,
  viewerId: string,
  muted: boolean,
): ConversationDetail {
  const peer = conversation.type === 'DIRECT'
    ? participants.find((participant) => participant.userId !== viewerId)
    : null;
  const peerUser = peer ? (peer as unknown as { user?: User | null }).user ?? null : null;
  return {
    id: conversation.id,
    type: conversation.type,
    title: conversation.title,
    peer: peerUser ? toUserCard(peerUser) : null,
    memberCount: participants.length,
    myRole,
    muted,
    participants: participants.map(toParticipantView),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

async function loadParticipants(
  conversationId: string,
  tx?: Transaction,
): Promise<ConversationParticipant[]> {
  return ConversationParticipant.findAll({
    where: { conversationId },
    include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
    order: [['createdAt', 'ASC']],
    transaction: tx,
  });
}

// Every protected access funnels through membership: outsiders get 404
// (no existence oracle, no IDOR), never a membership list.
// Exported for the messages module (and later socket handlers).
export async function requireMembership(
  userId: string,
  conversationId: string,
  tx?: Transaction,
): Promise<{ conversation: Conversation; membership: ConversationParticipant }> {
  const conversation = await Conversation.findByPk(conversationId, { transaction: tx });
  const membership = conversation
    ? await ConversationParticipant.findOne({
        where: { conversationId, userId },
        transaction: tx,
      })
    : null;
  if (!conversation || !membership) throw Errors.notFound('Conversation not found');
  return { conversation, membership };
}

function requireGroup(conversation: Conversation): void {
  if (conversation.type !== 'GROUP') {
    throw Errors.badRequest('This operation applies to group conversations only');
  }
}

function requireRoles(membership: ConversationParticipant, roles: ParticipantRole[]): void {
  if (!roles.includes(membership.role)) throw Errors.forbidden('Insufficient group permissions');
}

async function assertActiveUsers(userIds: string[], tx?: Transaction): Promise<Map<string, User>> {
  const users = await User.findAll({
    where: { id: { [Op.in]: userIds }, status: 'ACTIVE' },
    attributes: ['id', 'username', 'displayName', 'publicId', 'role'],
    transaction: tx,
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const missing = userIds.filter((id) => !byId.has(id));
  if (missing.length > 0) throw Errors.notFound('One or more users were not found');
  return byId;
}

// --- Creation ---

export async function createDirectConversation(
  creatorId: string,
  peerId: string,
): Promise<{ conversation: ConversationDetail; created: boolean }> {
  if (creatorId === peerId) throw Errors.badRequest('You cannot start a conversation with yourself');
  const peers = await assertActiveUsers([creatorId, peerId]);
  void peers;
  await assertNotBlocked(creatorId, peerId);

  const sequelize = getSequelize();
  return sequelize.transaction(async (tx) => {
    // Serialize pair creation across instances: without a DB-level pair
    // constraint, two concurrent creates would otherwise duplicate the DM.
    // The lock key is order-independent so both sides contend on one lock.
    const pairKey = `direct:${[creatorId, peerId].sort().join(':')}`;
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:pairKey))', {
      replacements: { pairKey },
      transaction: tx,
    });

    // Idempotency: exactly one DIRECT conversation per pair. The pair lookup
    // is bounded: it scans only DIRECT conversations of the creator.
    const mine = await ConversationParticipant.findAll({
      where: { userId: creatorId },
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: { type: 'DIRECT' },
          attributes: ['id'],
        },
      ],
      attributes: ['conversationId'],
      transaction: tx,
    });
    if (mine.length > 0) {
      const candidates = await ConversationParticipant.findAll({
        where: {
          conversationId: { [Op.in]: mine.map((m) => m.conversationId) },
          userId: peerId,
        },
        attributes: ['conversationId'],
        transaction: tx,
      });
      for (const candidate of candidates) {
        const members = await ConversationParticipant.count({
          where: { conversationId: candidate.conversationId },
          transaction: tx,
        });
        if (members === 2) {
          const conversation = await Conversation.findByPk(candidate.conversationId, {
            transaction: tx,
          });
          if (conversation) {
            const participants = await loadParticipants(conversation.id, tx);
            const myRole =
              participants.find((p) => p.userId === creatorId)?.role ?? ('MEMBER' as ParticipantRole);
            // Reopening: starting (or re-starting) a DM unhides it.
            await ConversationParticipant.update(
              { hidden: false },
              { where: { conversationId: conversation.id, userId: creatorId }, transaction: tx },
            );
            const muted = participants.find((p) => p.userId === creatorId)?.muted ?? false;
            return { conversation: toDetail(conversation, participants, myRole, creatorId, muted), created: false };
          }
        }
      }
    }

    const conversation = await Conversation.create(
      { type: 'DIRECT', title: null, createdBy: creatorId },
      { transaction: tx },
    );
    await ConversationParticipant.bulkCreate(
      [
        { conversationId: conversation.id, userId: creatorId, role: 'MEMBER' },
        { conversationId: conversation.id, userId: peerId, role: 'MEMBER' },
      ],
      { transaction: tx },
    );
    const participants = await loadParticipants(conversation.id, tx);
    return { conversation: toDetail(conversation, participants, 'MEMBER', creatorId, false), created: true };
  }).then((result) => {
    if (result.created) {
      emitToUserRooms([creatorId, peerId], 'conversation:new', {
        conversationId: result.conversation.id,
        type: 'DIRECT',
      });
    }
    return result;
  });
}

export async function createGroupConversation(
  creatorId: string,
  title: string,
  memberIds: string[],
): Promise<{ conversation: ConversationDetail; created: boolean }> {
  const unique = [...new Set(memberIds.filter((id) => id !== creatorId))];
  if (unique.length === 0) throw Errors.badRequest('A group needs at least one other member');
  if (unique.length + 1 > GROUP_MAX_MEMBERS) {
    throw Errors.badRequest(`Groups are limited to ${GROUP_MAX_MEMBERS} members`);
  }
  await assertActiveUsers([creatorId, ...unique]);
  // Creator↔member blocks only (WhatsApp semantics: blocks between other
  // members do not prevent shared group membership).
  for (const id of unique) {
    // eslint-disable-next-line no-await-in-loop
    await assertNotBlocked(creatorId, id);
  }

  const sequelize = getSequelize();
  return sequelize.transaction(async (tx) => {
    const conversation = await Conversation.create(
      { type: 'GROUP', title, createdBy: creatorId },
      { transaction: tx },
    );
    await ConversationParticipant.bulkCreate(
      [
        { conversationId: conversation.id, userId: creatorId, role: 'OWNER' },
        ...unique.map((id) => ({
          conversationId: conversation.id,
          userId: id,
          role: 'MEMBER' as ParticipantRole,
        })),
      ],
      { transaction: tx },
    );
    const participants = await loadParticipants(conversation.id, tx);
    return { conversation: toDetail(conversation, participants, 'OWNER', creatorId, false), created: true };
  }).then((result) => {
    emitToUserRooms(
      [creatorId, ...unique],
      'conversation:new',
      { conversationId: result.conversation.id, type: 'GROUP' },
    );
    return result;
  });
}

// --- Reads ---

export async function listMyConversations(
  userId: string,
  limit: number,
  offset: number,
): Promise<{ items: ConversationSummary[]; total: number }> {
  // Closed chats stay hidden until a new message (or explicit reopen) brings
  // them back. Membership and history are untouched by hiding.
  const { rows: memberships, count: total } = await ConversationParticipant.findAndCountAll({
    where: { userId, hidden: false },
    include: [{ model: Conversation, as: 'conversation' }],
    order: [[{ model: Conversation, as: 'conversation' }, 'updatedAt', 'DESC']],
    limit,
    offset,
  });

  const conversations = memberships.map(
    (m) => (m as unknown as { conversation: Conversation }).conversation,
  );
  const byId = new Map(conversations.map((c) => [c.id, c]));
  const allParticipants =
    conversations.length > 0
      ? await ConversationParticipant.findAll({
          where: { conversationId: { [Op.in]: [...byId.keys()] } },
          include: [
            { model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] },
          ],
        })
      : [];
  const grouped = new Map<string, ConversationParticipant[]>();
  for (const p of allParticipants) {
    const list = grouped.get(p.conversationId) ?? [];
    list.push(p);
    grouped.set(p.conversationId, list);
  }

  // Unread per conversation = unread MESSAGE notifications for this viewer.
  // One grouped query (no N+1); dismissed rows simply stop counting.
  const unreadByConversation = new Map<string, number>();
  if (conversations.length > 0) {
    const counts = (await Notification.findAll({
      where: {
        recipientId: userId,
        type: 'MESSAGE',
        readAt: null,
        conversationId: { [Op.in]: [...byId.keys()] },
      },
      attributes: ['conversationId'],
    })) as Notification[];
    for (const row of counts) {
      if (row.conversationId) {
        unreadByConversation.set(row.conversationId, (unreadByConversation.get(row.conversationId) ?? 0) + 1);
      }
    }
  }

  const items = memberships.map((m) => {
    const conversation = byId.get(m.conversationId);
    if (!conversation) throw Errors.notFound('Conversation not found');
    const participants = grouped.get(conversation.id) ?? [];
    const peer =
      conversation.type === 'DIRECT'
        ? (participants.find((p) => p.userId !== userId) ?? null)
        : null;
    const peerUser = peer ? (peer as unknown as { user?: User | null }).user ?? null : null;
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      peer: peerUser ? toUserCard(peerUser) : null,
      memberCount: participants.length,
      myRole: m.role,
      muted: m.muted,
      unreadCount: unreadByConversation.get(conversation.id) ?? 0,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  });
  return { items, total };
}

export async function getConversationDetail(
  userId: string,
  conversationId: string,
): Promise<ConversationDetail> {
  const { conversation, membership } = await requireMembership(userId, conversationId);
  const participants = await loadParticipants(conversation.id);
  return toDetail(conversation, participants, membership.role, userId, membership.muted);
}

// --- Mute / unmute (WhatsApp semantics) ---

// Muting stops notification pushes for this member only. Rows and unread
// counters keep working, so a muted chat still shows its count — just
// silently. Message delivery (message:new) is unaffected.
export async function muteConversation(
  userId: string,
  conversationId: string,
): Promise<{ muted: boolean }> {
  const { membership } = await requireMembership(userId, conversationId);
  if (!membership.muted) {
    membership.muted = true;
    await membership.save();
  }
  emitToUserRooms([userId], 'conversation:updated', { conversationId });
  return { muted: true };
}

export async function unmuteConversation(
  userId: string,
  conversationId: string,
): Promise<{ muted: boolean }> {
  const { membership } = await requireMembership(userId, conversationId);
  if (membership.muted) {
    membership.muted = false;
    await membership.save();
  }
  emitToUserRooms([userId], 'conversation:updated', { conversationId });
  return { muted: false };
}

// --- Close / reopen (hide from my list only) ---

// Closing keeps membership and history: the chat disappears from this
// member's list on every device. Works for DIRECT (which cannot be left)
// and GROUP alike. Blocking, unfriending, or removing a contact never
// auto-closes — the user closes explicitly.
export async function hideConversation(
  userId: string,
  conversationId: string,
): Promise<{ hidden: boolean }> {
  const { membership } = await requireMembership(userId, conversationId);
  if (!membership.hidden) {
    membership.hidden = true;
    await membership.save();
  }
  emitToUserRooms([userId], 'conversation:hidden', { conversationId });
  return { hidden: true };
}

export async function unhideConversation(
  userId: string,
  conversationId: string,
): Promise<{ hidden: boolean }> {
  const { membership } = await requireMembership(userId, conversationId);
  if (membership.hidden) {
    membership.hidden = false;
    await membership.save();
  }
  const ids = await currentMemberIds(conversationId);
  emitToUserRooms(ids, 'conversation:updated', { conversationId });
  return { hidden: false };
}

// --- Membership management (groups only) ---

export async function addMembers(
  requesterId: string,
  conversationId: string,
  userIds: string[],
): Promise<{ added: UserCard[] }> {
  const { conversation, membership } = await requireMembership(requesterId, conversationId);
  requireGroup(conversation);
  requireRoles(membership, ['OWNER', 'ADMIN']);

  const existing = await ConversationParticipant.findAll({
    where: { conversationId },
    attributes: ['userId'],
  });
  const existingIds = new Set(existing.map((p) => p.userId));
  const fresh = [...new Set(userIds)].filter((id) => !existingIds.has(id));
  if (fresh.length === 0) return { added: [] };
  if (existing.length + fresh.length > GROUP_MAX_MEMBERS) {
    throw Errors.badRequest(`Groups are limited to ${GROUP_MAX_MEMBERS} members`);
  }
  const byId = await assertActiveUsers(fresh);
  for (const id of fresh) {
    // eslint-disable-next-line no-await-in-loop
    await assertNotBlocked(requesterId, id);
  }

  try {
    await ConversationParticipant.bulkCreate(
      fresh.map((id) => ({ conversationId, userId: id, role: 'MEMBER' as ParticipantRole })),
    );
  } catch (err) {
    // Lost race with a concurrent add. The statement is atomic, so this call
    // inserted nothing — the winners own those rows; callers reconcile via
    // the conversation detail endpoint.
    if (!(err instanceof UniqueConstraintError)) throw err;
    return { added: [] };
  }
  const remaining = await currentMemberIds(conversationId);
  emitToUserRooms(remaining, 'conversation:updated', { conversationId });
  // Added members get a new-conversation hint so the group appears live.
  emitToUserRooms(fresh, 'conversation:new', { conversationId, type: 'GROUP' });
  return { added: fresh.map((id) => toUserCard(byId.get(id) as User)) };
}

export async function removeMember(
  requesterId: string,
  conversationId: string,
  targetId: string,
): Promise<void> {
  const { conversation, membership } = await requireMembership(requesterId, conversationId);
  requireGroup(conversation);
  if (requesterId === targetId) {
    throw Errors.badRequest('Use leave to remove yourself from a group');
  }
  const target = await ConversationParticipant.findOne({ where: { conversationId, userId: targetId } });
  if (!target) throw Errors.notFound('Member not found');
  if (target.role === 'OWNER') {
    throw Errors.forbidden('Ownership must be transferred before removing the owner');
  }
  if (membership.role === 'ADMIN' && target.role !== 'MEMBER') {
    throw Errors.forbidden('Insufficient group permissions');
  }
  requireRoles(membership, ['OWNER', 'ADMIN']);
  await target.destroy();
  const remaining = await currentMemberIds(conversationId);
  emitToUserRooms(remaining, 'conversation:updated', { conversationId });
  emitToUserRooms([targetId], 'conversation:removed', { conversationId });
}

export async function leaveConversation(userId: string, conversationId: string): Promise<{ deleted: boolean }> {
  const sequelize = getSequelize();
  const result = await sequelize.transaction(async (tx) => {
    const { conversation, membership } = await requireMembership(userId, conversationId, tx);
    requireGroup(conversation);
    const others = await ConversationParticipant.findAll({
      where: { conversationId, userId: { [Op.ne]: userId } },
      order: [['createdAt', 'ASC']],
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    await membership.destroy({ transaction: tx });
    if (others.length === 0) {
      // Last member out: the conversation goes with them.
      await conversation.destroy({ transaction: tx });
      return { deleted: true };
    }
    if (membership.role === 'OWNER') {
      // Single-OWNER invariant: oldest ADMIN inherits, else oldest member.
      const successor =
        others.find((o) => o.role === 'ADMIN') ?? others.sort((a, b) => {
          if (a.role === b.role) return a.createdAt.getTime() - b.createdAt.getTime();
          return a.role === 'ADMIN' ? -1 : 1;
        })[0];
      successor.role = 'OWNER';
      await successor.save({ transaction: tx });
    }
    return { deleted: false };
  });
  if (result.deleted) {
    emitToUserRooms([userId], 'conversation:deleted', { conversationId });
  } else {
    const remaining = await currentMemberIds(conversationId);
    emitToUserRooms(remaining, 'conversation:updated', { conversationId });
    emitToUserRooms([userId], 'conversation:removed', { conversationId });
  }
  return result;
}

export async function renameGroup(
  requesterId: string,
  conversationId: string,
  title: string,
): Promise<ConversationDetail> {
  const { conversation, membership } = await requireMembership(requesterId, conversationId);
  requireGroup(conversation);
  requireRoles(membership, ['OWNER', 'ADMIN']);
  conversation.title = title;
  await conversation.save();
  const participants = await loadParticipants(conversation.id);
  const detail = toDetail(conversation, participants, membership.role, requesterId, membership.muted);
  emitToUserRooms(participants.map((p) => p.userId), 'conversation:updated', { conversationId });
  return detail;
}

export async function transferOwnership(
  requesterId: string,
  conversationId: string,
  targetId: string,
): Promise<ConversationDetail> {
  const sequelize = getSequelize();
  return sequelize.transaction(async (tx) => {
    const { conversation, membership } = await requireMembership(requesterId, conversationId, tx);
    requireGroup(conversation);
    if (membership.role !== 'OWNER') throw Errors.forbidden('Only the owner can transfer ownership');
    if (targetId === requesterId) {
      const participants = await loadParticipants(conversation.id, tx);
      return toDetail(conversation, participants, membership.role, requesterId, membership.muted);
    }
    const target = await ConversationParticipant.findOne({
      where: { conversationId, userId: targetId },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!target) throw Errors.notFound('Member not found');
    target.role = 'OWNER';
    membership.role = 'ADMIN';
    await target.save({ transaction: tx });
    await membership.save({ transaction: tx });
    const participants = await loadParticipants(conversation.id, tx);
    return toDetail(conversation, participants, 'ADMIN', requesterId, membership.muted);
  }).then((detail) => {
    void currentMemberIds(conversationId)
      .then((ids) => emitToUserRooms(ids, 'conversation:updated', { conversationId }))
      .catch(() => undefined);
    return detail;
  });
}
