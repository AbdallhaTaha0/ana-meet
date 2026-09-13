import type { Sequelize } from 'sequelize';
import { initAdminAuditLog } from './AdminAuditLog';
import { initBlock } from './Block';
import { initContact } from './Contact';
import { initConversation } from './Conversation';
import { initConversationParticipant } from './ConversationParticipant';
import { initMediaAsset } from './MediaAsset';
import { initMessage } from './Message';
import { initNotification } from './Notification';
import { initStory } from './Story';
import { initRefreshSession } from './RefreshSession';
import { initUser } from './User';

export function initModels(sequelize: Sequelize): void {
  initUser(sequelize);
  initAdminAuditLog(sequelize);
  initRefreshSession(sequelize);
  initContact(sequelize);
  initBlock(sequelize);
  initConversation(sequelize);
  initConversationParticipant(sequelize);
  initMessage(sequelize);
  initMediaAsset(sequelize);
  initNotification(sequelize);
  initStory(sequelize);
}

export { User } from './User';
export { AdminAuditLog } from './AdminAuditLog';
export { RefreshSession } from './RefreshSession';
export { Contact } from './Contact';
export { Block } from './Block';
export { Conversation } from './Conversation';
export type { ConversationType } from './Conversation';
export { ConversationParticipant } from './ConversationParticipant';
export type { ParticipantRole } from './ConversationParticipant';
export { Message } from './Message';
export type { MessageStatus, MessageType } from './Message';
export { MediaAsset } from './MediaAsset';
export { Story } from './Story';
export type { StoryType } from './Story';
export { Notification } from './Notification';
export type { NotificationType } from './Notification';
