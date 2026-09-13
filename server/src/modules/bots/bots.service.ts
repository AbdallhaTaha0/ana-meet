import { User } from '../../db/models';
import { toUserCard, type UserCard } from '../blocks/blocks.service';

// Bots are account types, not a parallel identity system: they authenticate,
// converse, and notify through the exact same paths as users. This directory
// is the only bot-specific read surface.
export async function listBots(limit: number, offset: number): Promise<{ items: UserCard[]; total: number }> {
  const { rows, count } = await User.findAndCountAll({
    where: { role: 'BOT', status: 'ACTIVE' },
    attributes: ['id', 'username', 'displayName', 'publicId', 'role'],
    order: [['username', 'ASC']],
    limit,
    offset,
  });
  return { items: rows.map(toUserCard), total: count };
}
