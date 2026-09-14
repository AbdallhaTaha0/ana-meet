import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../shared/api';
import { useRealtimeSocket } from '../realtime/RealtimeProvider';
import { friendsApi } from '../friends/service';
import type { Notification } from '../../shared/types';

export interface Toast {
  id: string;
  title: string;
  body: string;
  to: string;
}

export function routeForNotification(n: Notification): string {
  if (n.conversationId) return `/app/chats/${n.conversationId}`;
  if (/friend request/i.test(n.title)) return '/app/people';
  return '/app/notifications';
}

// Global live updates: sidebar badges + toasts that work from any page.
// Source of truth stays REST (unread-count, pending list); sockets only hint.
export function useLiveUpdates() {
  const socket = useRealtimeSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());
  const unreadTimer = useRef<number | null>(null);
  const lastPath = useRef(location.pathname);
  const navTimer = useRef<number | null>(null);
  const badgesInflight = useRef(false);
  const badgesQueued = useRef(false);

  const refreshUnread = useCallback(
    () =>
      api
        .get<{ count: number }>('/api/v1/notifications/unread-count')
        .then(({ data }) => setUnread(data.count))
        .catch(() => undefined),
    [],
  );

  // Read receipts can fire per message when a chat opens — debounce the
  // badge refetch so a 40-message thread doesn't hammer unread-count.
  const scheduleUnreadRefresh = useCallback(() => {
    if (unreadTimer.current) window.clearTimeout(unreadTimer.current);
    unreadTimer.current = window.setTimeout(() => {
      unreadTimer.current = null;
      void refreshUnread();
    }, 800);
  }, [refreshUnread]);
  const refreshPending = useCallback(
    () =>
      friendsApi
        .list('inbound', 'PENDING')
        .then((page) => setPendingRequests(page.total))
        .catch(() => undefined),
    [],
  );
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshUnread(), refreshPending()]);
  }, [refreshPending, refreshUnread]);

  // Rapid tab switches collapse into one trailing fetch; an overlapping
  // fetch queues at most one follow-up instead of stacking requests.
  const scheduleNavRefresh = useCallback(() => {
    if (navTimer.current) window.clearTimeout(navTimer.current);
    navTimer.current = window.setTimeout(() => {
      navTimer.current = null;
      if (badgesInflight.current) {
        badgesQueued.current = true;
        return;
      }
      badgesInflight.current = true;
      void refreshAll().finally(() => {
        badgesInflight.current = false;
        if (badgesQueued.current) {
          badgesQueued.current = false;
          void refreshAll();
        }
      });
    }, 500);
  }, [refreshAll]);

  const pushToast = useCallback((notification: Notification) => {
    const toast: Toast = {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      to: routeForNotification(notification),
    };
    setToasts((old) => [toast, ...old.filter((t) => t.id !== toast.id)].slice(0, 4));
    const prev = timers.current.get(toast.id);
    if (prev) window.clearTimeout(prev);
    timers.current.set(
      toast.id,
      window.setTimeout(() => {
        setToasts((old) => old.filter((t) => t.id !== toast.id));
        timers.current.delete(toast.id);
      }, 7000),
    );
  }, []);

  useEffect(() => {
    void refreshAll();
    // Background tabs skip polling (throttled timers would otherwise pile up
    // a burst on return); coming back refreshes once instead.
    const poll = window.setInterval(() => {
      if (!document.hidden) void refreshAll();
    }, 30000);
    const onVisible = () => {
      if (!document.hidden) void refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshAll]);

  // Refetch badges when navigating (e.g. back from reading notifications) —
  // debounced so rapid sidebar switching fires one trailing request, and the
  // initial mount is skipped (the effect above already fetched).
  useEffect(() => {
    if (location.pathname === lastPath.current) return;
    lastPath.current = location.pathname;
    scheduleNavRefresh();
    return () => {
      if (navTimer.current) window.clearTimeout(navTimer.current);
    };
  }, [location.pathname, scheduleNavRefresh]);

  useEffect(() => {
    const onNotification = ({ notification }: { notification: Notification }) => {
      void refreshUnread();
      // Skip the toast when already looking at that conversation.
      if (
        notification.conversationId &&
        location.pathname === `/app/chats/${notification.conversationId}`
      )
        return;
      pushToast(notification);
    };
    const onFriend = () => {
      void refreshPending();
      void refreshUnread();
    };
    const onConnect = () => refreshAll();
    // Someone (possibly this user on another tab) read messages somewhere:
    // receipts arrive as message:status, so the Updates badge drops live.
    const onStatus = () => scheduleUnreadRefresh();
    // The Updates page marks everything seen on open.
    const onSeen = () => {
      void refreshUnread();
    };
    socket.on('notification:new', onNotification);
    socket.on('friend-request:new', onFriend);
    socket.on('friend-request:updated', onFriend);
    socket.on('friend-request:removed', onFriend);
    socket.on('message:status', onStatus);
    socket.on('connect', onConnect);
    window.addEventListener('ana-notifications-seen', onSeen);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('friend-request:new', onFriend);
      socket.off('friend-request:updated', onFriend);
      socket.off('friend-request:removed', onFriend);
      socket.off('message:status', onStatus);
      socket.off('connect', onConnect);
      window.removeEventListener('ana-notifications-seen', onSeen);
    };
  }, [location.pathname, pushToast, refreshAll, refreshPending, refreshUnread, scheduleUnreadRefresh, socket]);

  const dismissToast = useCallback((id: string) => {
    setToasts((old) => old.filter((t) => t.id !== id));
    const prev = timers.current.get(id);
    if (prev) window.clearTimeout(prev);
    timers.current.delete(id);
  }, []);

  const openToast = useCallback(
    (toast: Toast) => {
      dismissToast(toast.id);
      navigate(toast.to);
    },
    [dismissToast, navigate],
  );

  return { unread, pendingRequests, toasts, dismissToast, openToast, refreshAll };
}
