import type { Conversation } from '../../shared/types';

export function conversationName(conversation: Conversation): string {
  return conversation.type === 'DIRECT'
    ? conversation.peer?.displayName || 'Former member'
    : conversation.title || 'Group';
}
