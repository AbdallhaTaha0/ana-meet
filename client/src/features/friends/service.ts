import { api } from '../../shared/api';
import type { Page, UserCard } from '../../shared/types';

export interface FriendRequest {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  requester: UserCard;
  addressee: UserCard;
  createdAt: string;
  updatedAt: string;
}

export const friendsApi = {
  list: async (
    direction: 'inbound' | 'outbound' | 'all' = 'all',
    status?: FriendRequest['status'],
    signal?: AbortSignal,
  ) =>
    (
      await api.get<Page<FriendRequest>>('/api/v1/friend-requests', {
        params: { limit: 100, direction, status },
        signal,
      })
    ).data,
  send: async (addresseeId: string) =>
    (await api.post<{ request: FriendRequest }>('/api/v1/friend-requests', { addresseeId })).data
      .request,
  accept: async (id: string) =>
    (await api.post<{ request: FriendRequest }>(`/api/v1/friend-requests/${id}/accept`)).data.request,
  reject: async (id: string) =>
    (await api.post<{ request: FriendRequest }>(`/api/v1/friend-requests/${id}/reject`)).data.request,
  cancel: async (id: string) =>
    (await api.post<{ request: FriendRequest }>(`/api/v1/friend-requests/${id}/cancel`)).data.request,
  remove: async (id: string) => api.delete(`/api/v1/friend-requests/${id}`),
};
