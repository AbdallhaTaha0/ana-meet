import { MessageCircle, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Conversation } from '../../shared/types';
import { Avatar, Button, EmptyState, IconButton } from '../../shared/ui';
import { conversationName } from './display';

export function ConversationList({
  conversations,
  conversationId,
  search,
  onSearch,
  loading,
  onNew,
}: {
  conversations: Conversation[];
  conversationId?: string;
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  onNew: () => void;
}) {
  const filtered = conversations.filter((item) =>
    conversationName(item).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      aria-label="Conversations"
      className={`min-h-0 flex-col border-r border-line bg-white md:flex ${conversationId ? 'hidden' : 'flex'}`}
    >
      <header className="flex items-center justify-between px-6 pb-5 pt-8">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-sea uppercase">
            <span className="size-1.5 rounded-full bg-coral" />
            Your space
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
            Chats<span className="text-coral">.</span>
          </h1>
        </div>
        <IconButton
          label="New conversation"
          onClick={onNew}
          className="bg-sea text-white shadow-[0_8px_18px_#087f7025] hover:bg-sea-dark hover:text-white"
        >
          <Plus size={22} />
        </IconButton>
      </header>
      <label className="mx-5 mb-5 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 focus-within:ring-2 focus-within:ring-sea/20">
        <Search size={18} className="text-muted" />
        <span className="sr-only">Search conversations</span>
        <input
          className="w-full bg-transparent py-3 text-sm outline-none"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search conversations"
        />
      </label>
      {loading ? (
        <p role="status" className="p-5 text-sm text-muted">
          Loading conversations…
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No matching chats' : 'No conversations yet'}
          description={search ? 'Try another name.' : 'Find someone to start a conversation.'}
          action={
            !search && (
              <Button primary onClick={onNew}>
                <MessageCircle size={17} /> New conversation
              </Button>
            )
          }
        />
      ) : (
        <div className="min-h-0 space-y-1 overflow-y-auto px-3">
          {filtered.map((item) => (
            <Link
              key={item.id}
              to={`/app/chats/${item.id}`}
              className={`flex min-h-20 items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-paper ${conversationId === item.id ? 'bg-mist ring-1 ring-sea/10' : ''}`}
            >
              <Avatar name={conversationName(item)} />
              <span className="min-w-0 flex-1">
                <strong className="block truncate font-display text-[15px] font-semibold">
                  {conversationName(item)}
                </strong>
                <small className="block truncate text-xs text-muted">
                  {item.type === 'GROUP'
                    ? `${item.memberCount} members`
                    : item.peer?.username
                      ? `@${item.peer.username}`
                      : 'Direct chat'}
                </small>
              </span>
              <time className="self-start pt-2 text-[11px] text-muted">
                {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                  new Date(item.updatedAt),
                )}
              </time>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
