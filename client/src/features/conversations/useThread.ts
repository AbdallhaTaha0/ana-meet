import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isRequestAbort } from '../../shared/api';
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
  const removed = useRef<Set<string>>(new Set());
  const mergeHistory = (items: Message[], id: string) => {
    setMessages((current) => {
      const visible = items.filter((message) => !removed.current.has(message.id));
      return current
        .filter((message) => message.conversationId === id)
        .reduce(upsertMessage, visible);
    });
  };
  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const [detail, page] = await Promise.all([
      conversationsApi.detail(conversationId),
      conversationsApi.messages(conversationId),
    ]);
    if (currentId.current === conversationId) {
      setActive(detail);
      mergeHistory([...page.items].reverse(), conversationId);
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
    removed.current.clear();
    // Aborted on rapid navigation so stale loads never pile up server-side.
    const controller = new AbortController();
    Promise.all([
      conversationsApi.detail(conversationId, controller.signal),
      conversationsApi.messages(conversationId, undefined, controller.signal),
    ])
      .then(([detail, page]) => {
        if (live) {
          setActive(detail);
          mergeHistory([...page.items].reverse(), conversationId);
          setCursor(page.nextCursor);
        }
      })
      .catch((cause) => {
        if (isRequestAbort(cause)) return;
        if (live) setError(errorMessage(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId || !userId) return;
    // One batched request per new batch of unread messages — never one POST
    // per message, no matter how fast the user switches chats.
    const unread = messages.filter(
      (message) =>
        message.senderId !== userId &&
        message.status !== 'READ' &&
        !markedRead.current.has(message.id),
    );
    if (unread.length === 0) return;
    for (const message of unread) markedRead.current.add(message.id);
    void conversationsApi.readAll(conversationId).catch(() => {
      for (const message of unread) markedRead.current.delete(message.id);
    });
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
  const add = useCallback(
    (message: Message) => setMessages((old) => upsertMessage(old, message)),
    [],
  );
  const remove = useCallback((messageId: string) => {
    removed.current.add(messageId);
    setMessages((old) => old.filter((message) => message.id !== messageId));
  }, []);
  const status = useCallback(
    (messageId: string, next: Message['status']) =>
      setMessages((old) =>
        old.map((message) => (message.id === messageId ? { ...message, status: next } : message)),
      ),
    [],
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
