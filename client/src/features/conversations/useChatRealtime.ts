import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Message } from '../../shared/types';

interface Handlers {
  refreshList: () => Promise<void>;
  refreshThread: () => Promise<void>;
  add: (message: Message) => void;
  remove: (messageId: string) => void;
  status: (messageId: string, status: Message['status']) => void;
}

export function useChatRealtime(
  conversationId: string | undefined,
  peerId: string | undefined,
  userId: string | undefined,
  refreshUser: () => Promise<boolean>,
  handlers: Handlers,
) {
  const socket = useRef<Socket | null>(null);
  const current = useRef({ conversationId, peerId, userId, handlers });
  current.current = { conversationId, peerId, userId, handlers };
  const [typing, setTyping] = useState('');
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const client = io(import.meta.env.VITE_API_URL || undefined, {
      withCredentials: true,
      reconnection: true,
    });
    socket.current = client;
    client.on('connect', () => {
      void current.current.handlers.refreshList();
      if (current.current.conversationId)
        void current.current.handlers.refreshThread().catch(() => undefined);
      if (current.current.peerId)
        client.emit(
          'presence:get',
          { userId: current.current.peerId },
          (answer: { online?: boolean }) => setOnline(Boolean(answer.online)),
        );
    });
    client.on('connect_error', (cause: Error) => {
      if (cause.message === 'UNAUTHORIZED')
        void refreshUser().then((restored) => {
          if (restored) client.connect();
        });
    });
    client.on('message:new', ({ message }: { message: Message }) => {
      if (message.conversationId === current.current.conversationId)
        current.current.handlers.add(message);
      void current.current.handlers.refreshList();
    });
    client.on('message:updated', ({ message }: { message: Message }) => {
      if (message.conversationId === current.current.conversationId)
        current.current.handlers.add(message);
    });
    client.on(
      'message:deleted',
      ({ conversationId: id, messageId }: { conversationId: string; messageId: string }) => {
        if (id === current.current.conversationId) current.current.handlers.remove(messageId);
      },
    );
    client.on(
      'message:status',
      ({
        conversationId: id,
        messageId,
        status,
      }: {
        conversationId: string;
        messageId: string;
        status: Message['status'];
      }) => {
        if (id === current.current.conversationId)
          current.current.handlers.status(messageId, status);
      },
    );
    client.on(
      'typing:update',
      ({
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
      },
    );
    client.on('user:online', ({ userId: id }: { userId: string }) => {
      if (id === current.current.peerId) setOnline(true);
    });
    client.on('user:offline', ({ userId: id }: { userId: string }) => {
      if (id === current.current.peerId) setOnline(false);
    });
    const heartbeat = window.setInterval(() => {
      if (client.connected) client.emit('presence:heartbeat', {}, () => undefined);
    }, 30000);
    return () => {
      window.clearInterval(heartbeat);
      client.disconnect();
      socket.current = null;
    };
  }, [refreshUser]);
  useEffect(() => {
    setTyping('');
    setOnline(false);
    if (peerId && socket.current?.connected)
      socket.current.emit('presence:get', { userId: peerId }, (answer: { online?: boolean }) =>
        setOnline(Boolean(answer.online)),
      );
  }, [conversationId, peerId]);
  return { socket, typing, online };
}
