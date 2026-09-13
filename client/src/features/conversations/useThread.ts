import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../shared/api';
import type { Conversation, Message } from '../../shared/types';
import { conversationsApi } from './service';

export function upsertMessage(items: Message[], message: Message): Message[] {
  return [
    ...items.filter(
      (item) => item.id !== message.id && item.clientMessageId !== message.clientMessageId,
    ),
    message,
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function useThread(conversationId: string | undefined, userId: string | undefined) {
  const currentId = useRef(conversationId);
  currentId.current = conversationId;
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const markedRead = useRef<Set<string>>(new Set());
  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const [detail, page] = await Promise.all([
      conversationsApi.detail(conversationId),
      conversationsApi.messages(conversationId),
    ]);
    if (currentId.current === conversationId) {
      setActive(detail);
      setMessages([...page.items].reverse());
      setCursor(page.nextCursor);
    }
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId) {
      setActive(null);
      setMessages([]);
      setCursor(null);
      return;
    }
    setActive(null);
    setMessages([]);
    setCursor(null);
    let live = true;
    setLoading(true);
    setError('');
    markedRead.current.clear();
    Promise.all([
      conversationsApi.detail(conversationId),
      conversationsApi.messages(conversationId),
    ])
      .then(([detail, page]) => {
        if (live) {
          setActive(detail);
          setMessages([...page.items].reverse());
          setCursor(page.nextCursor);
        }
      })
      .catch((cause) => {
        if (live) setError(errorMessage(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId || !userId) return;
    for (const message of messages) {
      if (
        message.senderId === userId ||
        message.status === 'READ' ||
        markedRead.current.has(message.id)
      )
        continue;
      markedRead.current.add(message.id);
      void conversationsApi.read(conversationId, message.id).catch(() => {
        markedRead.current.delete(message.id);
      });
    }
  }, [conversationId, messages, userId]);
  async function loadOlder() {
    if (!conversationId || !cursor) return;
    try {
      const page = await conversationsApi.messages(conversationId, cursor);
      setMessages((old) => [...page.items.reverse(), ...old]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  const add = (message: Message) => setMessages((old) => upsertMessage(old, message));
  const remove = (messageId: string) =>
    setMessages((old) => old.filter((message) => message.id !== messageId));
  const status = (messageId: string, next: Message['status']) =>
    setMessages((old) =>
      old.map((message) => (message.id === messageId ? { ...message, status: next } : message)),
    );
  return {
    active,
    setActive,
    messages,
    cursor,
    loading,
    error,
    setError,
    refresh,
    loadOlder,
    add,
    remove,
    status,
  };
}
