import { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, errorMessage } from '../shared/api';
import type { CursorPage, Notification } from '../shared/types';
import { Button, ContentPage, EmptyState, ErrorNotice, IconButton, PageHeader } from '../shared/ui';

export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = async (next?: string) => {
    const { data } = await api.get<CursorPage<Notification>>('/api/v1/notifications', {
      params: { limit: 30, cursor: next },
    });
    setItems((old) => (next ? [...old, ...data.items] : data.items));
    setCursor(data.nextCursor);
  };
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || undefined, { withCredentials: true });
    const reload = () => {
      void load().catch((cause) => setError(errorMessage(cause)));
    };
    reload();
    socket.on('connect', reload);
    socket.on('notification:new', ({ notification }: { notification: Notification }) =>
      setItems((old) => [notification, ...old.filter((item) => item.id !== notification.id)]),
    );
    const heartbeat = window.setInterval(() => {
      if (socket.connected) socket.emit('presence:heartbeat', {}, () => undefined);
    }, 30000);
    return () => {
      window.clearInterval(heartbeat);
      socket.disconnect();
    };
  }, []);
  async function read(item: Notification) {
    try {
      if (!item.readAt) await api.post('/api/v1/notifications/read', { ids: [item.id] });
      setItems((old) =>
        old.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)),
      );
      if (item.conversationId) navigate(`/app/chats/${item.conversationId}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function readAll() {
    try {
      await api.post('/api/v1/notifications/read-all');
      setItems((old) =>
        old.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function remove(id: string) {
    try {
      await api.delete(`/api/v1/notifications/${id}`);
      setItems((old) => old.filter((item) => item.id !== id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <ContentPage>
      <PageHeader
        eyebrow="Stay up to date"
        title="Updates"
        description="Messages and announcements you may have missed."
        action={
          <Button
            onClick={() => {
              void readAll();
            }}
          >
            <Check size={18} /> Mark all read
          </Button>
        }
      />
      {error && <ErrorNotice message={error} />}
      {items.length === 0 ? (
        <EmptyState title="You're all caught up" description="New updates will appear here." />
      ) : (
        <div className="max-w-3xl">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 border-b border-line py-4">
              <span
                aria-label={item.readAt ? 'Read' : 'Unread'}
                className={`size-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-amber'}`}
              />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void read(item);
                }}
              >
                <strong className="block text-sm">{item.title}</strong>
                <span className="block text-sm text-muted">{item.body}</span>
                <time className="text-xs text-muted">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.createdAt))}
                </time>
              </button>
              <IconButton
                label="Dismiss notification"
                onClick={() => {
                  void remove(item.id);
                }}
              >
                <Trash2 size={18} />
              </IconButton>
            </div>
          ))}
          {cursor && (
            <Button
              className="mt-5"
              onClick={() => {
                void load(cursor).catch((cause) => setError(errorMessage(cause)));
              }}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </ContentPage>
  );
}
