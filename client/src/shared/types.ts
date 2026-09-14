export interface UserCard {
  id: string;
  username: string;
  displayName: string;
  publicId: string;
  isBot?: boolean;
}
export interface CurrentUser extends UserCard {
  email: string;
  role: 'USER' | 'BOT' | 'ADMIN';
  status: string;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  limit: number;
}
export interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  title: string | null;
  peer?: UserCard | null;
  memberCount: number;
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  muted: boolean;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  participants?: Array<{ userId: string; role: string; user: UserCard | null; joinedAt: string }>;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  sender: UserCard | null;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE';
  content: string | null;
  media: { url: string; mimeType: string; sizeBytes: number; fileName: string | null } | null;
  replyToMessageId: string | null;
  replyTo: { id: string; sender: UserCard | null; snippet: string; deleted: boolean } | null;
  clientMessageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Story {
  id: string;
  owner: UserCard;
  type: 'TEXT' | 'IMAGE' | 'VIDEO';
  content: string | null;
  media: { url: string; mimeType: string; sizeBytes: number } | null;
  expiresAt: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  type: 'MESSAGE' | 'SYSTEM';
  title: string;
  body: string;
  actor: UserCard | null;
  conversationId: string | null;
  messageId: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface Upload {
  key: string;
  url: string;
  urlPath: string;
  mimeType: string;
  type: 'IMAGE' | 'VIDEO' | 'FILE';
  sizeBytes: number;
  fileName: string;
}
