import { ConversationParticipant } from '../db/models';
import { logger } from '../common/logger';
import { emitToUserRooms } from './bus';

export async function publishConversationEvent(
  conversationId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    const members = await ConversationParticipant.findAll({
      where: { conversationId },
      attributes: ['userId'],
    });
    emitToUserRooms(members.map((member) => member.userId), event, payload);
  } catch (error) {
    logger.warn({ error: String(error), conversationId, event }, 'Realtime delivery failed');
  }
}
