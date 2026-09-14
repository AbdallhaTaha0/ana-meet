import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, isRequestAbort } from '../shared/api';
import { readFetchCache, writeFetchCache } from '../shared/fetchCache';
import { useRealtimeSocket } from '../features/realtime/RealtimeProvider';
import type { CursorPage, Notification } from '../shared/types';
import { Button, ContentPage, EmptyState, ErrorNotice, IconButton, PageHeader } from '../shared/ui';

export function NotificationsPage() {
  const socket = useRealtimeSocket();
  const navigate = useNavigate();
  const arrivals = useRef(new Map<string, Notification>());
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = async (next?: string, signal?: AbortSignal) => {
    const { data } = await api.get<CursorPage<Notification>>('/api/v1/notifications', {
      params: { limit: 30, cursor: next },
      signal,
    });
    if (!next) writeFetchCache('notifications:list', { items: data.items, cursor: data.nextCursor });
    setItems((old) => {
      if (next)
        return [...old, ...data.items.filter((item) => !old.some((row) => row.id === item.id))];
      return [
        ...[...arrivals.current.values()].filter(
          (item) => !data.items.some((row) => row.id === item.id),
        ),
        ...data.items,
      ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    });
    setCursor(data.nextCursor);
  };
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    // Opening the page means seen: load, then clear the whole stack so the
    // sidebar badge drops and dots don't linger after reading.
    const open = async () => {
      try {
        // Rapid revisits reuse the seconds-old list; the read-all below still
        // runs every visit so the stack reliably clears.
        const cached = readFetchCache<{ items: Notification[]; cursor: string | null }>(
          'notifications:list',
        );
        if (cached) {
          setItems(cached.items);
          setCursor(cached.cursor);
        } else {
          await load(undefined, controller.signal);
        }
        await api.post('/api/v1/notifications/read-all');
        if (!live) return;
        setItems((old) =>
          old.map((row) => ({ ...row, readAt: row.readAt || new Date().toISOString() })),
        );
        window.dispatchEvent(new Event('ana-notifications-seen'));
      } catch (cause) {
        if (isRequestAbort(cause)) return;
        if (live) setError(errorMessage(cause));
      }
    };
    void open();
    const reload = () => {
      void load().catch((cause) => {
        if (live) setError(errorMessage(cause));
      });
    };
    socket.on('connect', reload);
    const received = ({ notification }: { notification: Notification }) => {
      arrivals.current.set(notification.id, notification);
      setItems((old) => [
        { ...notification },
        ...old.filter((item) => item.id !== notification.id),
      ]);
      // The page is open, so arrivals are seen immediately — don't let them
      // pile up as unread behind the user's back.
      void api
        .post('/api/v1/notifications/read', { ids: [notification.id] })
        .then(() => {
          if (!live) return;
          setItems((old) =>
            old.map((row) =>
              row.id === notification.id
                ? { ...row, readAt: row.readAt || new Date().toISOString() }
                : row,
            ),
          );
          window.dispatchEvent(new Event('ana-notifications-seen'));
        })
        .catch(() => undefined);
    };
    socket.on('notification:new', received);
    return () => {
      live = false;
      controller.abort();
      socket.off('connect', reload);
      socket.off('notification:new', received);
    };
  }, [socket]);
  async function read(item: Notification) {
    try {
      if (!item.readAt) await api.post('/api/v1/notifications/read', { ids: [item.id] });
      setItems((old) =>
        old.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)),
      );
      if (item.conversationId) navigate(`/app/chats/${item.conversationId}`);
      else if (/friend request/i.test(item.title)) navigate('/app/people');
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
      arrivals.current.delete(id);
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
