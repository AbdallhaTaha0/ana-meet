import { useCallback, useLayoutEffect, useRef } from 'react';
import type { CurrentUser, Message } from '../../shared/types';
import { MessageItem } from './MessageItem';
import type { useThread } from './useThread';
import type { useMessageActions } from './useMessageActions';

export function MessageTimeline({
  conversationId,
  user,
  thread,
  actions,
}: {
  conversationId: string;
  user: CurrentUser | null;
  thread: ReturnType<typeof useThread>;
  actions: ReturnType<typeof useMessageActions>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const last = thread.messages.at(-1);
  // Stable per-message callbacks so memoized rows only re-render on data change.
  const { setReply, startEdit, remove } = actions;
  const handleDelete = useCallback(
    (item: Message) => {
      void remove(item);
    },
    [remove],
  );

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && (nearBottom.current || last?.senderId === user?.id))
      element.scrollTop = element.scrollHeight;
  }, [conversationId, last?.id, last?.senderId, user?.id]);

  return (
    <div
      ref={viewport}
      onScroll={(event) => {
        const element = event.currentTarget;
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8"
    >
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-end gap-4">
        {thread.cursor && (
          <button
            className="self-center text-xs text-sea underline"
            onClick={() => void thread.loadOlder()}
          >
            Load earlier messages
          </button>
        )}
        {thread.messages.length === 0 && (
          <p className="self-center text-sm text-muted">
            Say hello. This conversation is ready when you are.
          </p>
        )}
        {thread.messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            mine={message.senderId === user?.id}
            showSender={thread.active?.type === 'GROUP' && message.senderId !== user?.id}
            canDelete={message.senderId === user?.id || user?.role === 'ADMIN'}
            onReply={setReply}
            onEdit={startEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
