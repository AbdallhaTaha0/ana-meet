import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../shared/api';
import type { Conversation, UserCard } from '../../shared/types';
import { Modal } from '../../shared/Modal';
import { Button, ErrorNotice, Field } from '../../shared/ui';
import { useConfirm } from '../../shared/ConfirmDialog';
import { friendsApi, type FriendRequest } from '../friends/service';

interface Props {
  conversation: Conversation;
  userId?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onLeave: () => void;
  onHidden: () => void;
}

export function ConversationDetails({ conversation, userId, onClose, onChanged, onLeave, onHidden }: Props) {
  const [title, setTitle] = useState(conversation.title || '');
  const [memberIds, setMemberIds] = useState('');
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const confirm = useConfirm();
  const canManage =
    conversation.type === 'GROUP' && ['OWNER', 'ADMIN'].includes(conversation.myRole);
  const root = `/api/v1/conversations/${conversation.id}`;
  const loadRequests = () =>
    friendsApi
      .list('all')
      .then((page) => setRequests(page.items))
      .catch(() => undefined);
  useEffect(() => {
    void loadRequests();
  }, [conversation.id]);
  const relationFor = (otherId: string): FriendRequest | undefined =>
    requests.find(
      (r) =>
        (r.requester.id === otherId || r.addressee.id === otherId) &&
        (r.status === 'PENDING' || r.status === 'ACCEPTED'),
    );
  async function friendAction(run: () => Promise<unknown>) {
    try {
      setError('');
      await run();
      await loadRequests();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  function friendButtons(other: UserCard) {
    const rel = relationFor(other.id);
    const outgoing = rel ? rel.requester.id === userId : false;
    if (!rel)
      return (
        <Button
          onClick={() => {
            void friendAction(() => friendsApi.send(other.id));
          }}
        >
          Add friend
        </Button>
      );
    if (rel.status === 'ACCEPTED')
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-sea">Friends</span>
          <Button
            onClick={() => {
              void confirm({
                title: `Unfriend ${other.displayName}?`,
                description: 'You can send a new friend request later.',
                confirmLabel: 'Unfriend',
                danger: true,
              }).then((ok) => {
                if (ok) void friendAction(() => friendsApi.remove(rel.id));
              });
            }}
          >
            Unfriend
          </Button>
        </span>
      );
    if (outgoing)
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted">Request sent</span>
          <Button
            onClick={() => {
              void friendAction(() => friendsApi.cancel(rel.id));
            }}
          >
            Withdraw
          </Button>
        </span>
      );
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Button
          primary
          onClick={() => {
            void friendAction(() => friendsApi.accept(rel.id));
          }}
        >
          Accept
        </Button>
        <Button
          onClick={() => {
            void friendAction(() => friendsApi.reject(rel.id));
          }}
        >
          Decline
        </Button>
      </span>
    );
  }
  async function action(run: () => Promise<unknown>) {
    try {
      setError('');
      await run();
      await onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <Modal labelledBy="details-title" onClose={onClose}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="details-title" className="text-2xl font-bold">
          Conversation details
        </h2>
        <Button onClick={onClose}>Close</Button>
      </div>
      {conversation.type === 'DIRECT' ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted">
            Direct chat with {conversation.peer?.displayName || 'Former member'}.
          </p>
          {conversation.peer && <div>{friendButtons(conversation.peer)}</div>}
          <Button
            onClick={() => {
              void action(() =>
                api.post(`${root}/${conversation.muted ? 'unmute' : 'mute'}`),
              );
            }}
          >
            {conversation.muted ? 'Unmute chat' : 'Mute chat'}
          </Button>
          <p className="text-xs text-muted">
            {conversation.muted
              ? 'Muted: no popups for this chat, but unread messages still count.'
              : 'You will be notified about new messages in this chat.'}
          </p>
          <Button
            onClick={() => {
              void confirm({
                title: 'Close this chat?',
                description: 'It will disappear from your list. A new message will reopen it.',
                confirmLabel: 'Close chat',
              }).then((ok) => {
                if (ok)
                  void action(async () => {
                    await api.post(`${root}/hide`);
                    onHidden();
                  });
              });
            }}
          >
            Close chat
          </Button>
          {conversation.peer && (
            <Button
              className="border-danger text-danger"
              onClick={() => {
                void confirm({
                  title: `Block ${conversation.peer?.displayName}?`,
                  description: 'Pending friend requests will be withdrawn.',
                  confirmLabel: 'Block',
                  danger: true,
                }).then((ok) => {
                  if (ok)
                    void action(async () => {
                      await api.post('/api/v1/blocks', { blockedUserId: conversation.peer?.id });
                      onLeave();
                    });
                });
              }}
            >
              Block {conversation.peer.displayName}
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-5 text-sm text-muted">
            {conversation.memberCount} members · Your role: {conversation.myRole.toLowerCase()}
          </p>
          {canManage && (
            <div className="grid gap-3 border-b border-line pb-5">
              <Field
                id="rename-group"
                label="Group name"
                maxLength={100}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <Button
                disabled={!title.trim() || title === conversation.title}
                onClick={() => {
                  void action(() => api.patch(root, { title: title.trim() }));
                }}
              >
                Save name
              </Button>
              <Field
                id="member-ids"
                label="Add member user IDs, separated by commas"
                value={memberIds}
                onChange={(event) => setMemberIds(event.target.value)}
              />
              <Button
                disabled={!memberIds.trim()}
                onClick={() => {
                  void action(async () => {
                    await api.post(`${root}/members`, {
                      userIds: memberIds.split(/[\s,]+/).filter(Boolean),
                    });
                    setMemberIds('');
                  });
                }}
              >
                Add members
              </Button>
            </div>
          )}
          <h3 className="my-4 font-bold">Members</h3>
          <div className="space-y-2">
            {conversation.participants?.map((part) => (
              <div
                key={part.userId}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {part.user?.displayName || 'Former member'}
                  </strong>
                  <small className="text-xs text-muted">{part.role.toLowerCase()}</small>
                </div>
                {part.user && part.userId !== userId && <div>{friendButtons(part.user)}</div>}
                {canManage &&
                  part.role !== 'OWNER' &&
                  (conversation.myRole === 'OWNER' || part.role === 'MEMBER') && (
                    <Button
                      onClick={() => {
                        void action(() => api.delete(`${root}/members/${part.userId}`));
                      }}
                    >
                      Remove
                    </Button>
                  )}
                {conversation.myRole === 'OWNER' && part.role !== 'OWNER' && (
                  <Button
                    onClick={() => {
                      void confirm({
                        title: `Transfer ownership to ${part.user?.displayName || 'this member'}?`,
                        description: 'You will become an admin of this group.',
                        confirmLabel: 'Transfer',
                        danger: true,
                      }).then((ok) => {
                        if (ok)
                          void action(() => api.post(`${root}/transfer`, { userId: part.userId }));
                      });
                    }}
                  >
                    Make owner
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            className="mt-5 border-danger text-danger"
            onClick={() => {
              void confirm({
                title: 'Leave this group?',
                description: 'You will stop receiving its messages. This cannot be undone by you.',
                confirmLabel: 'Leave group',
                danger: true,
              }).then((ok) => {
                if (ok)
                  void action(async () => {
                    await api.post(`${root}/leave`);
                    onLeave();
                  });
              });
            }}
          >
            Leave group
          </Button>
          <Button
            className="mt-3"
            title="Hide this group from your list without leaving it. A new message will reopen it."
            onClick={() => {
              void confirm({
                title: 'Close this chat?',
                description: 'You stay a member — a new message will reopen it.',
                confirmLabel: 'Close chat',
              }).then((ok) => {
                if (ok)
                  void action(async () => {
                    await api.post(`${root}/hide`);
                    onHidden();
                  });
              });
            }}
          >
            Close chat
          </Button>
          <Button
            className="mt-3"
            onClick={() => {
              void action(() =>
                api.post(`${root}/${conversation.muted ? 'unmute' : 'mute'}`),
              );
            }}
          >
            {conversation.muted ? 'Unmute group' : 'Mute group'}
          </Button>
        </>
      )}
      {error && <ErrorNotice message={error} />}
    </Modal>
  );
}
