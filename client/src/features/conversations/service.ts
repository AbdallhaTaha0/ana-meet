import { api } from '../../shared/api';
import type { Conversation, CursorPage, Message, Page, Upload, UserCard } from '../../shared/types';

export const conversationsApi = {
  list: async (signal?: AbortSignal) =>
    (await api.get<Page<Conversation>>('/api/v1/conversations', { params: { limit: 100 }, signal })).data,
  detail: async (id: string, signal?: AbortSignal) =>
    (await api.get<{ conversation: Conversation }>(`/api/v1/conversations/${id}`, { signal })).data
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
  messages: async (id: string, cursor?: string, signal?: AbortSignal) =>
    (
      await api.get<CursorPage<Message>>(`/api/v1/conversations/${id}/messages`, {
        params: { limit: 40, cursor },
        signal,
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
  readAll: async (id: string) =>
    (await api.post<{ updated: number }>(`/api/v1/conversations/${id}/messages/read`)).data,
  hide: async (id: string) =>
    (await api.post<{ hidden: boolean }>(`/api/v1/conversations/${id}/hide`)).data,
  unhide: async (id: string) =>
    (await api.post<{ hidden: boolean }>(`/api/v1/conversations/${id}/unhide`)).data,
  mute: async (id: string) =>
    (await api.post<{ muted: boolean }>(`/api/v1/conversations/${id}/mute`)).data,
  unmute: async (id: string) =>
    (await api.post<{ muted: boolean }>(`/api/v1/conversations/${id}/unmute`)).data,
  search: async (q: string) =>
    (await api.get<{ items: UserCard[] }>('/api/v1/users/search', { params: { q } })).data.items,
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await api.post<{ media: Upload }>('/api/v1/uploads', form, { timeout: 120000 })).data
      .media;
  },
};
