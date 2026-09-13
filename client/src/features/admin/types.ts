export interface Stats {
  users: { active: number };
  conversations: { total: number };
  messages: { total: number };
  stories: { active: number };
  notifications: { unread: number };
}
export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'DISABLED';
}
export interface Audit {
  id: string;
  action: string;
  targetType: string;
  createdAt: string;
  admin: { displayName: string } | null;
}
