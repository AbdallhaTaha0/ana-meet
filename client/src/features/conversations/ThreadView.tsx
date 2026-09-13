import { ArrowLeft, LoaderCircle, MessageCircle, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CurrentUser } from '../../shared/types';
import { Avatar, Button, EmptyState, ErrorNotice, IconButton } from '../../shared/ui';
import { MessageItem } from './MessageItem';
import { MessageComposer } from './MessageComposer';
import { conversationName } from './display';
import type { useThread } from './useThread';
import type { useMessageActions } from './useMessageActions';

type Thread = ReturnType<typeof useThread>;
type Actions = ReturnType<typeof useMessageActions>;

export function ThreadView({
  conversationId,
  user,
  thread,
  actions,
  typing,
  online,
  onNew,
  onDetails,
}: {
  conversationId?: string;
  user: CurrentUser | null;
  thread: Thread;
  actions: Actions;
  typing: string;
  online: boolean;
  onNew: () => void;
  onDetails: () => void;
}) {
  return (
    <section
      aria-label="Conversation"
      className={`min-h-0 flex-col bg-[#f5f8f4] ${conversationId ? 'flex' : 'hidden md:flex'}`}
    >
      {!conversationId ? (
        <div className="grid flex-1 place-items-center">
          <EmptyState
            title="Every conversation starts somewhere."
            description="Choose a chat or find someone new to talk to."
            action={
              <Button primary onClick={onNew}>
                <MessageCircle size={17} /> Start a conversation
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <header className="flex min-h-20 items-center gap-3 border-b border-line bg-white/95 px-3 shadow-[0_3px_16px_#192e3705] md:px-7">
            <Link
              to="/app/chats"
              className="grid size-10 place-items-center rounded-lg text-muted hover:bg-mist md:hidden"
              aria-label="Back to chats"
            >
              <ArrowLeft size={21} />
            </Link>
            <Avatar name={thread.active ? conversationName(thread.active) : ''} small />
            <div className="min-w-0 flex-1">
              <strong className="block truncate font-display text-base font-semibold">
                {thread.active ? conversationName(thread.active) : 'Conversation'}
              </strong>
              <small className="text-xs text-muted">
                {typing ||
                  (thread.active?.type === 'DIRECT'
                    ? online
                      ? 'Online'
                      : 'Offline'
                    : `${thread.active?.memberCount ?? ''} members`)}
              </small>
            </div>
            <IconButton label="Conversation details" onClick={onDetails}>
              <MoreHorizontal size={22} />
            </IconButton>
          </header>
          {thread.loading ? (
            <div className="grid flex-1 place-items-center text-sm text-muted" role="status">
              <LoaderCircle className="animate-spin" />
              Loading messages…
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
              <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-end gap-4">
                {thread.cursor && (
                  <button
                    className="self-center text-xs text-sea underline"
                    onClick={() => {
                      void thread.loadOlder();
                    }}
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
                    onReply={actions.setReply}
                    onEdit={actions.startEdit}
                    onDelete={(item) => {
                      void actions.remove(item);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {(thread.error || actions.error) && (
            <div className="px-4">
              <ErrorNotice
                message={thread.error || actions.error}
                onDismiss={() => {
                  thread.setError('');
                  actions.setError('');
                }}
              />
            </div>
          )}
          <MessageComposer
            draft={actions.draft}
            busy={actions.busy}
            reply={actions.reply}
            editing={actions.editing}
            onDraft={actions.changeDraft}
            onSubmit={(event) => {
              void actions.submit(event);
            }}
            onUpload={(file) => {
              void actions.upload(file);
            }}
            onCancel={actions.cancelContext}
          />
        </>
      )}
    </section>
  );
}
