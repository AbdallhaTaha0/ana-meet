import { Op } from 'sequelize';
import { Errors } from '../../common/errors';
import { User } from '../../db/models';
import {
  getBlockedUserIds,
  isBlockedEitherWay,
  toUserCard,
  type UserCard,
} from '../blocks/blocks.service';
import type { UpdateMeInput } from './users.schemas';

// Escape LIKE wildcards so user input cannot widen the match.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function searchUsers(
  viewerId: string,
  q: string,
  limit: number,
): Promise<{ items: UserCard[] }> {
  const term = q.trim();
  const hidden = await getBlockedUserIds(viewerId);
  const excluded = [viewerId, ...hidden];

  // Public-ID lookup accepts with or without the leading '#'.
  const publicId = term.startsWith('#') ? term.slice(1) : term;
  const publicIdExact = /^[A-Za-z0-9]{2,16}$/.test(publicId)
    ? [{ publicId: `#${publicId.toUpperCase()}` }]
    : [];

  const users = await User.findAll({
    where: {
      status: 'ACTIVE',
      id: { [Op.notIn]: excluded },
      [Op.or]: [
        { username: { [Op.iLike]: `${escapeLike(term.toLowerCase())}%` } },
        { displayName: { [Op.iLike]: `%${escapeLike(term)}%` } },
        ...publicIdExact,
      ],
    },
    attributes: ['id', 'username', 'displayName', 'publicId', 'role'],
    order: [['username', 'ASC']],
    limit,
  });
  // Search results are public cards only — email is never exposed here.
  return { items: users.map(toUserCard) };
}

export async function getProfile(viewerId: string, targetId: string): Promise<UserCard> {
  const target = await User.findByPk(targetId, {
    attributes: ['id', 'username', 'displayName', 'publicId', 'status', 'role'],
  });
  if (!target || target.status !== 'ACTIVE') throw Errors.notFound('User not found');
  if (viewerId !== targetId) {
    // A block in either direction makes the profile invisible (no oracle).
    if (await isBlockedEitherWay(viewerId, targetId)) throw Errors.notFound('User not found');
  }
  return toUserCard(target);
}

export async function updateMe(
  userId: string,
  input: UpdateMeInput,
): Promise<UserCard & { email: string }> {
  const user = await User.findByPk(userId);
  if (!user || user.status !== 'ACTIVE') throw Errors.unauthorized('Invalid or expired token');

  if (input.username && input.username !== user.username) {
    const taken = await User.findOne({ where: { username: input.username }, attributes: ['id'] });
    if (taken) throw Errors.conflict('Username is already taken');
    user.username = input.username;
  }
  if (input.displayName) user.displayName = input.displayName;
  await user.save();

  return {
    ...toUserCard(user),
    email: user.email,
  };
}
