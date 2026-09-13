import { Op } from 'sequelize';
import { Errors } from '../../common/errors';
import { logger } from '../../common/logger';
import { Contact, Story, User } from '../../db/models';
import {
  getBlockedUserIds,
  isBlockedEitherWay,
  toUserCard,
  type UserCard,
} from '../blocks/blocks.service';
import type { CreateStoryInput } from './stories.schemas';
import { assertOwnUploadReference } from '../uploads/uploads.access';

// Server-fixed lifetime: clients cannot mint immortal (or instantly-dead)
// stories, and expiry semantics stay uniform.
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export interface StoryView {
  id: string;
  owner: UserCard;
  type: string;
  content: string | null;
  media: { url: string; mimeType: string; sizeBytes: number } | null;
  expiresAt: Date;
  createdAt: Date;
}

function toView(story: Story): StoryView {
  const owner = (story as unknown as { owner: User }).owner;
  return {
    id: story.id,
    owner: toUserCard(owner),
    type: story.type,
    content: story.content,
    media:
      story.mediaUrl && story.mimeType && story.sizeBytes !== null
        ? { url: story.mediaUrl, mimeType: story.mimeType, sizeBytes: Number(story.sizeBytes) }
        : null,
    expiresAt: story.expiresAt,
    createdAt: story.createdAt,
  };
}

const ownerInclude = {
  model: User,
  as: 'owner',
  attributes: ['id', 'username', 'displayName', 'publicId', 'role'],
  where: { status: 'ACTIVE' },
};

export async function createStory(ownerId: string, input: CreateStoryInput): Promise<StoryView> {
  if (input.type !== 'TEXT') {
    await assertOwnUploadReference(ownerId, input.mediaUrl, input.mimeType, input.sizeBytes);
  }
  const created = await Story.create({
    ownerId,
    type: input.type,
    content: input.type === 'TEXT' ? input.content : null,
    mediaUrl: input.type === 'TEXT' ? null : input.mediaUrl,
    mimeType: input.type === 'TEXT' ? null : input.mimeType,
    sizeBytes: input.type === 'TEXT' ? null : input.sizeBytes,
    expiresAt: new Date(Date.now() + STORY_TTL_MS),
  });
  const full = await Story.findByPk(created.id, { include: [ownerInclude] });
  if (!full) throw Errors.internal();
  return toView(full);
}

async function activeStoriesWhere(extra: object, limit: number, offset: number) {
  return Story.findAll({
    where: { expiresAt: { [Op.gt]: new Date() }, ...extra },
    include: [ownerInclude],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
}

export async function listFeed(
  viewerId: string,
  limit: number,
  offset: number,
): Promise<{ items: StoryView[] }> {
  // Feed = self + contacts. Anything else is reachable via explicit profile
  // views, never pushed into the feed.
  const contacts = await Contact.findAll({ where: { userId: viewerId }, attributes: ['contactUserId'] });
  const hidden = await getBlockedUserIds(viewerId);
  const hiddenSet = new Set(hidden);
  const ownerIds = [viewerId, ...contacts.map((c) => c.contactUserId)].filter(
    (id) => !hiddenSet.has(id),
  );
  if (ownerIds.length === 0) return { items: [] };
  const rows = await activeStoriesWhere({ ownerId: { [Op.in]: ownerIds } }, limit, offset);
  return { items: rows.map(toView) };
}

export async function listUserStories(viewerId: string, ownerId: string): Promise<{ items: StoryView[] }> {
  const owner = await User.findByPk(ownerId, { attributes: ['id', 'status'] });
  if (!owner || owner.status !== 'ACTIVE') throw Errors.notFound('User not found');
  if (viewerId !== ownerId && (await isBlockedEitherWay(viewerId, ownerId))) {
    throw Errors.notFound('User not found');
  }
  const rows = await activeStoriesWhere({ ownerId }, 100, 0);
  return { items: rows.map(toView) };
}

export async function deleteStory(ownerId: string, storyId: string): Promise<void> {
  // Owner-only; anything else is 404 (no existence/ownership oracle).
  const deleted = await Story.destroy({ where: { id: storyId, ownerId } });
  if (deleted === 0) throw Errors.notFound('Story not found');
}

// Idempotent janitor: hard-deletes expired rows in bounded batches.
// Correctness never depends on it (reads always filter expiresAt), it only
// bounds table growth. Safe to run on every instance concurrently.
export async function deleteExpiredStories(batchLimit = 1000): Promise<number> {
  const expired = await Story.findAll({
    where: { expiresAt: { [Op.lte]: new Date() } },
    attributes: ['id'],
    limit: batchLimit,
  });
  if (expired.length === 0) return 0;
  const count = await Story.destroy({ where: { id: { [Op.in]: expired.map((s) => s.id) } } });
  logger.info({ deleted: count }, 'Story expiry sweep completed');
  return count;
}

export function startStorySweeper(intervalMs = 60 * 60 * 1000): () => void {
  const timer = setInterval(() => {
    deleteExpiredStories().catch((err: unknown) =>
      logger.warn({ err: String(err) }, 'Story expiry sweep failed'),
    );
  }, intervalMs);
  // Never keep the process alive just for janitorial work.
  timer.unref?.();
  return () => clearInterval(timer);
}
