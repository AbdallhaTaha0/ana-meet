import { api } from '../../shared/api';
import type { Conversation, CursorPage, Message, Page, Upload, UserCard } from '../../shared/types';

export const conversationsApi = {
  list: async () =>
    (await api.get<Page<Conversation>>('/api/v1/conversations', { params: { limit: 100 } })).data,
  detail: async (id: string) =>
    (await api.get<{ conversation: Conversation }>(`/api/v1/conversations/${id}`)).data
      .conversation,
  direct: async (peerId: string) =>
    (await api.post<{ conversation: Conversation }>('/api/v1/conversations/direct', { peerId }))
      .data.conversation,
  group: async (title: string, memberIds: string[]) =>
    (
      await api.post<{ conversation: Conversation }>('/api/v1/conversations/group', {
        title,
        memberIds,
      })
    ).data.conversation,
  messages: async (id: string, cursor?: string) =>
    (
      await api.get<CursorPage<Message>>(`/api/v1/conversations/${id}/messages`, {
        params: { limit: 40, cursor },
      })
    ).data,
  send: async (id: string, body: object) =>
    (await api.post<{ message: Message }>(`/api/v1/conversations/${id}/messages`, body)).data
      .message,
  edit: async (id: string, messageId: string, content: string) =>
    (
      await api.patch<{ message: Message }>(`/api/v1/conversations/${id}/messages/${messageId}`, {
        content,
      })
    ).data.message,
  remove: async (id: string, messageId: string) =>
    api.delete(`/api/v1/conversations/${id}/messages/${messageId}`),
  read: async (id: string, messageId: string) =>
    api.post(`/api/v1/conversations/${id}/messages/${messageId}/status`, { status: 'READ' }),
  search: async (q: string) =>
    (await api.get<{ items: UserCard[] }>('/api/v1/users/search', { params: { q } })).data.items,
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post<{ media: Upload }>('/api/v1/uploads', form, { timeout: 120000 })).data
      .media;
  },
};
