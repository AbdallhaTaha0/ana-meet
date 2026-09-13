import { useState } from 'react';
import { api, errorMessage } from '../../shared/api';
import type { Conversation } from '../../shared/types';
import { Modal } from '../../shared/Modal';
import { Button, ErrorNotice, Field } from '../../shared/ui';

interface Props {
  conversation: Conversation;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onLeave: () => void;
}

export function ConversationDetails({ conversation, onClose, onChanged, onLeave }: Props) {
  const [title, setTitle] = useState(conversation.title || '');
  const [memberIds, setMemberIds] = useState('');
  const [error, setError] = useState('');
  const canManage =
    conversation.type === 'GROUP' && ['OWNER', 'ADMIN'].includes(conversation.myRole);
  const root = `/api/v1/conversations/${conversation.id}`;
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
        <p className="text-sm text-muted">
          Direct chat with {conversation.peer?.displayName || 'Former member'}.
        </p>
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
                      if (
                        window.confirm(
                          `Transfer ownership to ${part.user?.displayName || 'this member'}?`,
                        )
                      )
                        void action(() => api.post(`${root}/transfer`, { userId: part.userId }));
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
              if (window.confirm('Leave this group?'))
                void action(async () => {
                  await api.post(`${root}/leave`);
                  onLeave();
                });
            }}
          >
            Leave group
          </Button>
        </>
      )}
      {error && <ErrorNotice message={error} />}
    </Modal>
  );
}
