import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { ConversationDetails } from '../features/conversations/ConversationDetails';
import { ConversationList } from '../features/conversations/ConversationList';
import { NewConversationDialog } from '../features/conversations/NewConversationDialog';
import { ThreadView } from '../features/conversations/ThreadView';
import { conversationsApi } from '../features/conversations/service';
import { useChatRealtime } from '../features/conversations/useChatRealtime';
import { useMessageActions } from '../features/conversations/useMessageActions';
import { useThread } from '../features/conversations/useThread';
import { errorMessage, isRequestAbort } from '../shared/api';
import { readFetchCache, writeFetchCache } from '../shared/fetchCache';
import type { Conversation } from '../shared/types';
import { ErrorNotice } from '../shared/ui';

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState<Awaited<ReturnType<typeof conversationsApi.search>>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const refreshList = useCallback(async () => {
    const page = await conversationsApi.list();
    writeFetchCache('conversations:list', page.items);
    setConversations(page.items);
  }, []);
  useEffect(() => {
    let live = true;
    // Spam-clicking tabs reuses the seconds-old list; socket events and
    // mutations always refresh it fresh via refreshList.
    const cached = readFetchCache<Conversation[]>('conversations:list');
    if (cached) {
      setConversations(cached);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    conversationsApi
      .list(controller.signal)
      .then((page) => {
        if (live) {
          writeFetchCache('conversations:list', page.items);
          setConversations(page.items);
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
  }, []);
  useEffect(() => {
    if (!creating || !personQuery.trim()) {
      setPeople([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void conversationsApi
        .search(personQuery.trim())
        .then((items) => {
          if (live) setPeople(items);
        })
        .catch((cause) => {
          if (live) setError(errorMessage(cause));
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [creating, personQuery]);
  const thread = useThread(conversationId, user?.id);
  const realtime = useChatRealtime(conversationId, thread.active?.peer?.id, user?.id, {
    refreshList,
    refreshThread: thread.refresh,
    add: thread.add,
    remove: thread.remove,
    status: thread.status,
    conversationGone: () => {
      navigate('/app/chats');
    },
  });  const actions = useMessageActions(
    conversationId,
    realtime.socket,
    thread.add,
    thread.remove,
    refreshList,
  );
  async function openConversation(create: () => Promise<Conversation>) {
    try {
      setError('');
      const conversation = await create();
      setCreating(false);
      setPersonQuery('');
      setSelected([]);
      setGroupTitle('');
      await refreshList();
      navigate(`/app/chats/${conversation.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  // Close chat: hides it from my sidebar on every device. Membership and
  // history stay intact — a new message (or starting the chat again) reopens it.
  const closeChat = useCallback(
    async (id: string) => {
      try {
        setError('');
        await conversationsApi.hide(id);
        await refreshList();
        if (id === conversationId) navigate('/app/chats');
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
    [conversationId, navigate, refreshList],
  );
  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-white md:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <ConversationList
        conversations={conversations}
        conversationId={conversationId}
        search={search}
        onSearch={setSearch}
        loading={loading}
        onNew={() => setCreating(true)}
        onClose={closeChat}
      />
      <ThreadView
        conversationId={conversationId}
        user={user}
        thread={thread}
        actions={actions}
        typing={realtime.typing}
        online={realtime.online}
        onNew={() => setCreating(true)}
        onDetails={() => setDetailsOpen(true)}
      />
      {error && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm">
          <ErrorNotice message={error} onDismiss={() => setError('')} />
        </div>
      )}
      {creating && (
        <NewConversationDialog
          search={personQuery}
          people={people}
          selected={selected}
          groupTitle={groupTitle}
          error={error}
          onSearch={setPersonQuery}
          onSelect={(id) =>
            setSelected((old) =>
              old.includes(id) ? old.filter((item) => item !== id) : [...old, id],
            )
          }
          onGroupTitle={setGroupTitle}
          onDirect={(person) => {
            void openConversation(() => conversationsApi.direct(person.id));
          }}
          onGroup={() => {
            if (groupTitle.trim() && selected.length)
              void openConversation(() => conversationsApi.group(groupTitle.trim(), selected));
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {detailsOpen && thread.active && (
        <ConversationDetails
          conversation={thread.active}
          userId={user?.id}
          onClose={() => setDetailsOpen(false)}
          onChanged={async () => {
            await thread.refresh();
            await refreshList();
          }}
          onLeave={() => {
            setDetailsOpen(false);
            navigate('/app/chats');
            void refreshList();
          }}
          onHidden={() => {
            setDetailsOpen(false);
            navigate('/app/chats');
            void refreshList();
          }}
        />
      )}
    </div>
  );
}
