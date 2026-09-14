import { Op } from 'sequelize';
import { Errors } from '../../common/errors';
import { Contact, ConversationParticipant, MediaAsset, Message, Story } from '../../db/models';
import { getStorage } from '../../storage';
import { isBlockedEitherWay } from '../blocks/blocks.service';

function keyForMediaUrl(mediaUrl: string): string | null {
  try {
    const path = new URL(mediaUrl).pathname;
    const prefix = '/api/v1/uploads/';
    return path.startsWith(prefix) ? decodeURIComponent(path.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

export async function assertOwnUploadReference(ownerId: string, mediaUrl: string, mimeType: string, sizeBytes: number): Promise<void> {
  const key = keyForMediaUrl(mediaUrl);
  if (!key) return;
  const asset = await MediaAsset.findByPk(key);
  if (!asset || asset.ownerId !== ownerId || asset.mimeType !== mimeType || Number(asset.sizeBytes) !== sizeBytes) {
    throw Errors.forbidden('You can only attach your own uploaded media');
  }
}

export async function assertCanReadUpload(asset: MediaAsset, userId: string, role: string): Promise<void> {
  if (role === 'ADMIN' || asset.ownerId === userId) return;
  const urlPath = getStorage().urlPathFor(asset.id);
  // Shared via a message: any conversation member may read it.
  const message = await Message.findOne({ where: { mediaUrl: { [Op.like]: `%${urlPath}` } }, attributes: ['conversationId'] });
  if (message) {
    const member = await ConversationParticipant.findOne({ where: { conversationId: message.conversationId, userId }, attributes: ['userId'] });
    if (member) return;
  }
  // Shared via an active story: followers of the owner (the feed audience)
  // may read it. Either sharing path grants access independently — a
  // story-only asset must not require a message reference first.
  const story = await Story.findOne({ where: { mediaUrl: { [Op.like]: `%${urlPath}` }, expiresAt: { [Op.gt]: new Date() } }, attributes: ['ownerId'] });
  if (!story) throw Errors.notFound('File not found');
  const contact = await Contact.findOne({ where: { userId, contactUserId: story.ownerId }, attributes: ['userId'] });
  if (!contact || await isBlockedEitherWay(userId, story.ownerId)) throw Errors.notFound('File not found');
}
