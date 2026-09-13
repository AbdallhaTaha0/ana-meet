import { Errors } from '../../common/errors';
import { UniqueConstraintError } from 'sequelize';
import { Contact, User } from '../../db/models';
import { assertNotBlocked, toUserCard, type UserCard } from '../blocks/blocks.service';

export async function addContact(
  ownerId: string,
  contactUserId: string,
): Promise<{ contact: UserCard; created: boolean }> {
  if (ownerId === contactUserId) {
    throw Errors.badRequest('You cannot add yourself as a contact');
  }
  const target = await User.findByPk(contactUserId, {
    attributes: ['id', 'username', 'displayName', 'publicId', 'status', 'role'],
  });
  if (!target || target.status !== 'ACTIVE') throw Errors.notFound('User not found');
  // No contact across a block in either direction.
  await assertNotBlocked(ownerId, contactUserId);

  let created: boolean;
  try {
    const [, c] = await Contact.findOrCreate({
      where: { userId: ownerId, contactUserId },
      defaults: { userId: ownerId, contactUserId },
    });
    created = c;
  } catch (err) {
    // Lost race with a concurrent add: idempotent outcome, same contract.
    if (!(err instanceof UniqueConstraintError)) throw err;
    created = false;
  }
  return { contact: toUserCard(target), created };
}

export async function listContacts(
  ownerId: string,
  limit: number,
  offset: number,
): Promise<{ items: UserCard[]; total: number }> {
  // Only active accounts are listed; deleted users vanish via CASCADE,
  // disabled ones are filtered by the join.
  const { rows, count } = await Contact.findAndCountAll({
    where: { userId: ownerId },
    include: [
      {
        model: User,
        as: 'contactUser',
        attributes: ['id', 'username', 'displayName', 'publicId', 'role'],
        where: { status: 'ACTIVE' },
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return {
    items: rows.map((row) => toUserCard((row as unknown as { contactUser: User }).contactUser)),
    total: count,
  };
}

export async function removeContact(ownerId: string, contactUserId: string): Promise<void> {
  // Idempotent: removing a non-contact is a no-op.
  await Contact.destroy({ where: { userId: ownerId, contactUserId } });
}
