import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useRealtimeSocket } from '../realtime/RealtimeProvider';
import type { Message } from '../../shared/types';

interface Handlers {
  refreshList: () => Promise<void>;
  refreshThread: () => Promise<void>;
  add: (message: Message) => void;
  remove: (messageId: string) => void;
  status: (messageId: string, status: Message['status']) => void;
  conversationGone?: (conversationId: string) => void;
}

export function useChatRealtime(
  conversationId: string | undefined,
  peerId: string | undefined,
  userId: string | undefined,
  handlers: Handlers,
) {
  const client = useRealtimeSocket();
  const socket = useRef<Socket | null>(client);
  const current = useRef({ conversationId, peerId, userId, handlers });
  current.current = { conversationId, peerId, userId, handlers };
  const [typing, setTyping] = useState('');
  const [online, setOnline] = useState(false);
  const listTimer = useRef<number | null>(null);

  // Read receipts arrive per message (one event each when a thread opens) —
  // debounce the list refetch so unread pills settle without a request storm.
  const scheduleListRefresh = () => {
    if (listTimer.current) window.clearTimeout(listTimer.current);
    listTimer.current = window.setTimeout(() => {
      listTimer.current = null;
      void current.current.handlers.refreshList().catch(() => undefined);
    }, 1200);
  };

  useEffect(() => {
    const checkPresence = () => {
      if (!client.connected || !current.current.peerId) return;
      const requestedId = current.current.peerId;
      client.emit('presence:get', { userId: requestedId }, (answer: { online?: boolean }) => {
        if (current.current.peerId === requestedId) setOnline(Boolean(answer.online));
      });
    };
    const connected = () => {
      void current.current.handlers.refreshList().catch(() => undefined);
      void current.current.handlers.refreshThread().catch(() => undefined);
      checkPresence();
    };
    const disconnected = () => setOnline(false);
    const added = ({ message }: { message: Message }) => {
      if (message.conversationId === current.current.conversationId)
        current.current.handlers.add(message);
      void current.current.handlers.refreshList().catch(() => undefined);
    };
    const updated = ({ message }: { message: Message }) => {
      if (message.conversationId === current.current.conversationId)
        current.current.handlers.add(message);
    };
    const deleted = ({
      conversationId: id,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => {
      if (id === current.current.conversationId) current.current.handlers.remove(messageId);
    };
    const status = ({
      conversationId: id,
      messageId,
      status: next,
    }: {
      conversationId: string;
      messageId: string;
      status: Message['status'];
    }) => {
      if (id === current.current.conversationId) current.current.handlers.status(messageId, next);
      // A read somewhere (possibly me on another tab) changes unread pills.
      scheduleListRefresh();
    };
    const typingUpdate = ({
      conversationId: id,
      userId: sender,
      typing: isTyping,
    }: {
      conversationId: string;
      userId: string;
      typing: boolean;
    }) => {
      if (id === current.current.conversationId && sender !== current.current.userId)
        setTyping(isTyping ? 'Typing…' : '');
    };
    // Live conversation list: any membership change refetches. If the open
    // thread was removed/deleted, redirect out instead of showing stale members.
    const conversationHint = ({ conversationId: id }: { conversationId: string }) => {
      void current.current.handlers.refreshList().catch(() => undefined);
      if (id && id === current.current.conversationId) {
        void current.current.handlers.refreshThread().catch(() => undefined);
      }
    };
    const conversationGone = ({ conversationId: id }: { conversationId: string }) => {
      void current.current.handlers.refreshList().catch(() => undefined);
      if (id && id === current.current.conversationId) {
        current.current.handlers.conversationGone?.(id);
      }
    };
    client.on('connect', connected);
    client.on('disconnect', disconnected);
    client.on('message:new', added);
    client.on('message:updated', updated);
    client.on('message:deleted', deleted);
    client.on('message:status', status);
    client.on('typing:update', typingUpdate);
    client.on('conversation:new', conversationHint);
    client.on('conversation:updated', conversationHint);
    client.on('conversation:removed', conversationGone);
    client.on('conversation:deleted', conversationGone);
    client.on('conversation:hidden', conversationGone);
    if (client.connected) connected();
    const poll = window.setInterval(checkPresence, 30000);
    return () => {
      window.clearInterval(poll);
      if (listTimer.current) window.clearTimeout(listTimer.current);
      client.off('connect', connected);
      client.off('disconnect', disconnected);
      client.off('message:new', added);
      client.off('message:updated', updated);
      client.off('message:deleted', deleted);
      client.off('message:status', status);
      client.off('typing:update', typingUpdate);
      client.off('conversation:new', conversationHint);
      client.off('conversation:updated', conversationHint);
      client.off('conversation:removed', conversationGone);
      client.off('conversation:deleted', conversationGone);
      client.off('conversation:hidden', conversationGone);
    };
  }, [client]);

  useEffect(() => {
    setTyping('');
    setOnline(false);
    if (peerId && client.connected)
      client.emit('presence:get', { userId: peerId }, (answer: { online?: boolean }) => {
        if (current.current.peerId === peerId) setOnline(Boolean(answer.online));
      });
  }, [client, conversationId, peerId]);

  return { socket, typing, online };
}
