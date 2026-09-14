import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../shared/api';
import { useConfirm } from '../../shared/ConfirmDialog';
import type { Page } from '../../shared/types';
import type { AdminUser, Audit, Stats } from './types';

export function useAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const confirm = useConfirm();
  const load = useCallback(async () => {
    const [overview, people, logs] = await Promise.all([
      api.get<Stats>('/api/v1/admin/stats'),
      api.get<Page<AdminUser>>('/api/v1/admin/users', {
        params: { limit: 100, ...(search.trim() ? { search: search.trim() } : {}) },
      }),
      api.get<Page<Audit>>('/api/v1/admin/audit-log', { params: { limit: 20 } }),
    ]);
    setStats(overview.data);
    setUsers(people.data.items);
    setAudit(logs.data.items);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((cause) => setError(errorMessage(cause)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function act(person: AdminUser, action: 'disable' | 'restore' | 'delete') {
    const titles = {
      delete: `Permanently delete ${person.displayName}?`,
      disable: `Disable ${person.displayName}?`,
      restore: `Restore ${person.displayName}?`,
    } as const;
    const descriptions = {
      delete: 'The account and its sessions vanish immediately. Peer history is preserved.',
      disable: 'They will be logged out and unable to log in until restored.',
      restore: 'They will be able to log in again with a fresh session.',
    } as const;
    const ok = await confirm({
      title: titles[action],
      description: descriptions[action],
      confirmLabel: action === 'delete' ? 'Delete forever' : action === 'disable' ? 'Disable' : 'Restore',
      danger: action !== 'restore',
    });
    if (!ok) return;
    setError('');
    setNotice('');
    try {
      if (action === 'delete') await api.delete(`/api/v1/admin/users/${person.id}`);
      else await api.post(`/api/v1/admin/users/${person.id}/${action}`);
      setNotice(
        `${person.displayName} ${action === 'delete' ? 'deleted' : action === 'disable' ? 'disabled' : 'restored'}.`,
      );
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function createBot(bot: { username: string; displayName: string; email: string }) {
    setError('');
    setPassword('');
    try {
      const { data } = await api.post<{ initialPassword: string }>('/api/v1/admin/bots', bot);
      setPassword(data.initialPassword);
      await load();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }
  async function announce(data: { title: string; body: string; userIds: string }) {
    setError('');
    try {
      await api.post('/api/v1/admin/announcements', {
        title: data.title,
        body: data.body,
        userIds: data.userIds.split(/[\s,]+/).filter(Boolean),
      });
      setNotice('Announcement sent.');
      await load();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  }
  return {
    stats,
    users,
    audit,
    search,
    setSearch,
    error,
    notice,
    password,
    act,
    createBot,
    announce,
  };
}
