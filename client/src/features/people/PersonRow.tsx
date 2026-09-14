import { Ban, MessageCircle, UserMinus, UserPlus, UserCheck, UserX } from 'lucide-react';
import type { UserCard } from '../../shared/types';
import { useConfirm } from '../../shared/ConfirmDialog';
import { Avatar, Button, IconButton } from '../../shared/ui';

export function PersonRow({
  person,
  isContact,
  friendStatus,
  isOutgoing,
  onChat,
  onContact,
  onBlock,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onUnfriend,
}: {
  person: UserCard;
  isContact: boolean;
  friendStatus?: 'PENDING' | 'ACCEPTED';
  isOutgoing?: boolean;
  onChat: () => void;
  onContact?: () => void;
  onBlock?: () => void;
  onSendRequest?: () => void;
  onAcceptRequest?: () => void;
  onRejectRequest?: () => void;
  onUnfriend?: () => void;
}) {
  const confirm = useConfirm();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-4">
      <Avatar name={person.displayName} />
      <div className="min-w-0 flex-1">
        <strong className="block text-sm">
          {person.displayName}
          {person.isBot ? ' · Bot' : ''}
        </strong>
        <small className="text-xs text-muted">
          @{person.username} · {person.publicId}
        </small>
      </div>
      {onContact && (
        <IconButton
          label={
            isContact
              ? `Remove ${person.displayName} from contacts`
              : `Add ${person.displayName} to contacts`
          }
          onClick={onContact}
        >
          {isContact ? <UserMinus size={19} /> : <UserPlus size={19} />}
        </IconButton>
      )}
      <Button onClick={onChat}>
        <MessageCircle size={17} /> Chat
      </Button>
      {friendStatus === 'ACCEPTED' ? (
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-sea">
            <UserCheck size={16} /> Friends
          </span>
          {onUnfriend && (
            <Button
              onClick={() => {
                void confirm({
                  title: `Unfriend ${person.displayName}?`,
                  description: 'You can send a new friend request later.',
                  confirmLabel: 'Unfriend',
                  danger: true,
                }).then((ok) => {
                  if (ok) onUnfriend();
                });
              }}
            >
              <UserX size={16} /> Unfriend
            </Button>
          )}
        </span>
      ) : friendStatus === 'PENDING' ? (
        isOutgoing ? (
          <span className="text-xs font-bold text-muted">Request sent</span>
        ) : onAcceptRequest ? (
          <span className="flex gap-2">
            <Button primary onClick={onAcceptRequest}>
              Accept
            </Button>
            {onRejectRequest && <Button onClick={onRejectRequest}>Decline</Button>}
          </span>
        ) : (
          <span className="text-xs font-bold text-muted">Request pending</span>
        )
      ) : onSendRequest ? (
        <IconButton label={`Send ${person.displayName} a friend request`} onClick={onSendRequest}>
          <UserCheck size={18} />
        </IconButton>
      ) : null}
      {onBlock && (
        <IconButton label={`Block ${person.displayName}`} onClick={onBlock}>
          <Ban size={18} />
        </IconButton>
      )}
      {friendStatus === 'PENDING' && isOutgoing && onRejectRequest && (
        <IconButton label="Withdraw friend request" onClick={onRejectRequest}>
          <UserX size={18} />
        </IconButton>
      )}
    </div>
  );
}
