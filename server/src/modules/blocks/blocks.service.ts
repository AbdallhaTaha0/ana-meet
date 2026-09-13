import { Op, UniqueConstraintError } from 'sequelize';
import { Errors } from '../../common/errors';
import { Block, Contact, User } from '../../db/models';
import { getSequelize } from '../../db/sequelize';

export interface UserCard {
  id: string;
  username: string;
  displayName: string;
  publicId: string;
  // Bots are discoverable as bots; the ADMIN role is never exposed in cards.
  isBot: boolean;
}

export function toUserCard(user: User): UserCard {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    publicId: user.publicId,
    isBot: user.role === 'BOT',
  };
}

// A block in EITHER direction is a barrier. Used by search, profiles,
// contacts, and (later) conversations/messages — never rely on the client.
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await Block.findOne({
    where: {
      [Op.or]: [
        { blockerId: a, blockedUserId: b },
        { blockerId: b, blockedUserId: a },
      ],
    },
    attributes: ['id'],
  });
  return row !== null;
}

export async function assertNotBlocked(a: string, b: string): Promise<void> {
  if (await isBlockedEitherWay(a, b)) {
    throw Errors.blocked();
  }
}

// All user ids that share a block relationship with the given user,
// in either direction. Block lists are small; callers use NOT IN filters.
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const rows = await Block.findAll({
    where: { [Op.or]: [{ blockerId: userId }, { blockedUserId: userId }] },
    attributes: ['blockerId', 'blockedUserId'],
  });
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.blockerId === userId ? row.blockedUserId : row.blockerId);
  }
  return [...ids];
}

export async function blockUser(
  blockerId: string,
  blockedUserId: string,
): Promise<{ blocked: UserCard; created: boolean }> {
  if (blockerId === blockedUserId) {
    throw Errors.badRequest('You cannot block yourself');
  }
  const target = await User.findByPk(blockedUserId, { attributes: ['id', 'status'] });
  if (!target || target.status !== 'ACTIVE') {
    // Same 404 as a missing user: no existence oracle for disabled accounts.
    throw Errors.notFound('User not found');
  }

  const sequelize = getSequelize();
  return sequelize.transaction(async (tx) => {
    let created: boolean;
    try {
      const [, c] = await Block.findOrCreate({
        where: { blockerId, blockedUserId },
        defaults: { blockerId, blockedUserId },
        transaction: tx,
      });
      created = c;
    } catch (err) {
      // Lost race with a concurrent block: idempotent outcome, same contract.
      if (!(err instanceof UniqueConstraintError)) throw err;
      created = false;
    }
    // Blocking severs the private bookmark both ways so a blocked user
    // cannot linger in anyone's contact list.
    await Contact.destroy({
      where: {
        [Op.or]: [
          { userId: blockerId, contactUserId: blockedUserId },
          { userId: blockedUserId, contactUserId: blockerId },
        ],
      },
      transaction: tx,
    });
    const full = await User.findByPk(blockedUserId, {
      attributes: ['id', 'username', 'displayName', 'publicId', 'role'],
      transaction: tx,
    });
    if (!full) throw Errors.notFound('User not found');
    return { blocked: toUserCard(full), created };
  });
}

export async function unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
  // Idempotent: unblocking someone who isn't blocked is a no-op.
  await Block.destroy({ where: { blockerId, blockedUserId } });
}

export async function listBlocks(
  userId: string,
  limit: number,
  offset: number,
): Promise<{ items: UserCard[]; total: number }> {
  const { rows, count } = await Block.findAndCountAll({
    where: { blockerId: userId },
    include: [{ model: User, as: 'blockedUser', attributes: ['id', 'username', 'displayName', 'publicId', 'role'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return {
    items: rows.map((row) => toUserCard((row as unknown as { blockedUser: User }).blockedUser)),
    total: count,
  };
}
