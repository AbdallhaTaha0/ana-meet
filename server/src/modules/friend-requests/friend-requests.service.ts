import { Op, UniqueConstraintError } from 'sequelize';
import { Errors } from '../../common/errors';
import { Contact, FriendRequest, Notification, User } from '../../db/models';
import { getSequelize } from '../../db/sequelize';
import { emitToUserRooms } from '../../realtime/bus';
import { assertNotBlocked, toUserCard, type UserCard } from '../blocks/blocks.service';

export interface FriendRequestView {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  requester: UserCard;
  addressee: UserCard;
  createdAt: Date;
  updatedAt: Date;
}

type Populated = FriendRequest & { requester?: User | null; addressee?: User | null };

function toView(row: Populated): FriendRequestView {
  if (!row.requester || !row.addressee) throw Errors.internal();
  return {
    id: row.id,
    status: row.status,
    requester: toUserCard(row.requester),
    addressee: toUserCard(row.addressee),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const cardAttrs = ['id', 'username', 'displayName', 'publicId', 'role'] as const;

async function loadView(id: string): Promise<FriendRequestView> {
  const row = (await FriendRequest.findByPk(id, {
    include: [
      { model: User, as: 'requester', attributes: [...cardAttrs, 'status'] },
      { model: User, as: 'addressee', attributes: [...cardAttrs, 'status'] },
    ],
  })) as Populated | null;
  if (!row) throw Errors.notFound('Friend request not found');
  return toView(row);
}

async function assertActiveUser(id: string): Promise<User> {
  const user = await User.findByPk(id, { attributes: ['id', 'username', 'displayName', 'publicId', 'role', 'status'] });
  if (!user || user.status !== 'ACTIVE') throw Errors.notFound('User not found');
  return user;
}

async function notify(recipientId: string, actorId: string, title: string, body: string): Promise<void> {
  try {
    const row = await Notification.create({
      recipientId,
      actorId,
      type: 'SYSTEM',
      title: title.slice(0, 160),
      body: body.slice(0, 280),
      conversationId: null,
      messageId: null,
    });
    const full = await Notification.findByPk(row.id, {
      include: [{ model: User, as: 'actor', attributes: [...cardAttrs] }],
    });
    const actor = (full as unknown as { actor?: User | null } | null)?.actor ?? null;
    emitToUserRooms([recipientId], 'notification:new', {
      notification: {
        id: row.id,
        type: 'SYSTEM',
        title: row.title,
        body: row.body,
        actor: actor ? toUserCard(actor) : null,
        conversationId: null,
        messageId: null,
        readAt: null,
        createdAt: row.createdAt,
      },
    });
  } catch {
    // Best-effort: never fail the friend flow on notification errors.
  }
}

function pairWhere(a: string, b: string) {
  return { [Op.or]: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] };
}

// Reviewing a request clears its stack: the reviewer's pending friend-request
// notifications from the other party are marked read best-effort, so decided
// requests stop counting as unread anywhere (People page, Updates page).
async function clearFriendNotifications(recipientId: string, actorId: string): Promise<void> {
  try {
    await Notification.update(
      { readAt: new Date() },
      {
        where: {
          recipientId,
          actorId,
          type: 'SYSTEM',
          title: { [Op.iLike]: '%friend request%' },
          readAt: null,
        },
      },
    );
  } catch {
    // Best-effort only.
  }
}

// Message-first flow: sending a hello message (direct conversation) never
// requires a friend request. Requests are a separate social signal with an
// explicit accept/reject, and REJECTED/CANCELLED never blocks re-requesting.
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<{ request: FriendRequestView; created: boolean }> {
  if (requesterId === addresseeId) throw Errors.badRequest('You cannot send yourself a friend request');
  await assertActiveUser(addresseeId);
  await assertNotBlocked(requesterId, addresseeId);

  const existing = (await FriendRequest.findOne({
    where: pairWhere(requesterId, addresseeId),
    include: [
      { model: User, as: 'requester', attributes: [...cardAttrs, 'status'] },
      { model: User, as: 'addressee', attributes: [...cardAttrs, 'status'] },
    ],
  })) as Populated | null;

  if (existing) {
    if (existing.status === 'PENDING') {
      // Idempotent: same or reverse pending returns the waiting request so
      // the other side can accept it instead of forking a second row.
      return { request: toView(existing), created: false };
    }
    if (existing.status === 'ACCEPTED') {
      return { request: toView(existing), created: false };
    }
    // REJECTED/CANCELLED: re-requestable. Reuse the single pair row and flip
    // it back to PENDING with the new direction.
    existing.requesterId = requesterId;
    existing.addresseeId = addresseeId;
    existing.status = 'PENDING';
    await existing.save();
    const view = await loadView(existing.id);
    emitToUserRooms([requesterId, addresseeId], 'friend-request:new', { request: view });
    await notify(addresseeId, requesterId, 'New friend request', 'Someone wants to be your friend.');
    return { request: view, created: true };
  }

  try {
    const created = await FriendRequest.create({ requesterId, addresseeId, status: 'PENDING' });
    const view = await loadView(created.id);
    emitToUserRooms([requesterId, addresseeId], 'friend-request:new', { request: view });
    await notify(addresseeId, requesterId, 'New friend request', 'Someone wants to be your friend.');
    return { request: view, created: true };
  } catch (err) {
    if (!(err instanceof UniqueConstraintError)) throw err;
    // Lost race: return the winner idempotently.
    const winner = (await FriendRequest.findOne({
      where: pairWhere(requesterId, addresseeId),
      include: [
        { model: User, as: 'requester', attributes: [...cardAttrs, 'status'] },
        { model: User, as: 'addressee', attributes: [...cardAttrs, 'status'] },
      ],
    })) as Populated | null;
    if (!winner) throw Errors.internal();
    return { request: toView(winner), created: false };
  }
}

export async function listFriendRequests(
  userId: string,
  direction: 'inbound' | 'outbound' | 'all',
  status: FriendRequestView['status'] | undefined,
  limit: number,
  offset: number,
): Promise<{ items: FriendRequestView[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (direction === 'inbound') where.addresseeId = userId;
  else if (direction === 'outbound') where.requesterId = userId;
  else where[Op.or as unknown as string] = [{ requesterId: userId }, { addresseeId: userId }];
  if (status) where.status = status;
  const { rows, count } = await FriendRequest.findAndCountAll({
    where,
    include: [
      { model: User, as: 'requester', attributes: [...cardAttrs] },
      { model: User, as: 'addressee', attributes: [...cardAttrs] },
    ],
    order: [['updatedAt', 'DESC']],
    limit,
    offset,
  });
  return { items: (rows as Populated[]).map(toView), total: count };
}

async function requireParticipant(userId: string, id: string): Promise<FriendRequest> {
  const row = await FriendRequest.findByPk(id);
  if (!row || (row.requesterId !== userId && row.addresseeId !== userId)) {
    throw Errors.notFound('Friend request not found');
  }
  return row;
}

export async function acceptFriendRequest(
  userId: string,
  id: string,
): Promise<{ request: FriendRequestView }> {
  const sequelize = getSequelize();
  await sequelize.transaction(async (tx) => {
    const row = await FriendRequest.findByPk(id, { transaction: tx });
    if (!row || (row.requesterId !== userId && row.addresseeId !== userId)) {
      throw Errors.notFound('Friend request not found');
    }
    if (row.addresseeId !== userId) throw Errors.forbidden('Only the recipient can accept this request');
    if (row.status === 'ACCEPTED') return;
    if (row.status !== 'PENDING') throw Errors.badRequest('This request is no longer pending');
    await assertActiveUser(row.requesterId);
    await assertNotBlocked(row.requesterId, row.addresseeId);
    row.status = 'ACCEPTED';
    await row.save({ transaction: tx });
    // Friends see each other in stories feed: mirror as mutual contacts.
    await Contact.findOrCreate({
      where: { userId: row.requesterId, contactUserId: row.addresseeId },
      defaults: { userId: row.requesterId, contactUserId: row.addresseeId },
      transaction: tx,
    });
    await Contact.findOrCreate({
      where: { userId: row.addresseeId, contactUserId: row.requesterId },
      defaults: { userId: row.addresseeId, contactUserId: row.requesterId },
      transaction: tx,
    });
  });
  const view = await loadView(id);
  emitToUserRooms([view.requester.id, view.addressee.id], 'friend-request:updated', { request: view });
  await clearFriendNotifications(userId, view.requester.id);
  await notify(view.requester.id, userId, 'Friend request accepted', 'You are now friends.');
  return { request: view };
}

export async function rejectFriendRequest(
  userId: string,
  id: string,
): Promise<{ request: FriendRequestView }> {
  const row = await requireParticipant(userId, id);
  if (row.addresseeId !== userId) throw Errors.forbidden('Only the recipient can review this request');
  if (row.status === 'REJECTED') return { request: await loadView(row.id) };
  if (row.status !== 'PENDING') throw Errors.badRequest('This request is no longer pending');
  row.status = 'REJECTED';
  await row.save();
  const view = await loadView(row.id);
  emitToUserRooms([view.requester.id, view.addressee.id], 'friend-request:updated', { request: view });
  await clearFriendNotifications(userId, view.requester.id);
  await notify(view.requester.id, userId, 'Friend request declined', 'You can send a new request later.');
  return { request: view };
}

export async function cancelFriendRequest(
  userId: string,
  id: string,
): Promise<{ request: FriendRequestView }> {
  const row = await requireParticipant(userId, id);
  if (row.requesterId !== userId) throw Errors.forbidden('Only the sender can cancel this request');
  if (row.status === 'CANCELLED') return { request: await loadView(row.id) };
  if (row.status !== 'PENDING') throw Errors.badRequest('This request is no longer pending');
  row.status = 'CANCELLED';
  await row.save();
  const view = await loadView(row.id);
  emitToUserRooms([view.requester.id, view.addressee.id], 'friend-request:updated', { request: view });
  // Withdrawing clears the addressee's pending stack entry.
  await clearFriendNotifications(view.addressee.id, view.requester.id);
  return { request: view };
}

export async function removeFriendRequest(userId: string, id: string): Promise<void> {
  const sequelize = getSequelize();
  const removed = await sequelize.transaction(async (tx) => {
    const row = await requireParticipant(userId, id);
    const wasAccepted = row.status === 'ACCEPTED';
    const a = row.requesterId;
    const b = row.addresseeId;
    await row.destroy({ transaction: tx });
    if (wasAccepted) {
      // Unfriending removes the feed mirroring both ways.
      await Contact.destroy({
        where: { [Op.or]: [{ userId: a, contactUserId: b }, { userId: b, contactUserId: a }] },
        transaction: tx,
      });
    }
    return { a, b };
  });
  emitToUserRooms([removed.a, removed.b], 'friend-request:removed', { id });
  // Unfriend/delete clears both sides' pending friend-request stack entries.
  await clearFriendNotifications(removed.a, removed.b);
  await clearFriendNotifications(removed.b, removed.a);
}

// Blocks cancel pending requests between the pair but never create friendships.
export async function cancelPendingForPair(a: string, b: string): Promise<void> {
  await FriendRequest.update(
    { status: 'CANCELLED' },
    { where: { ...pairWhere(a, b), status: 'PENDING' } },
  );
}
