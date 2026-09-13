import { Ban, MessageCircle, UserMinus, UserPlus } from 'lucide-react';
import type { UserCard } from '../../shared/types';
import { Avatar, Button, IconButton } from '../../shared/ui';

export function PersonRow({
  person,
  isContact,
  onChat,
  onContact,
  onBlock,
}: {
  person: UserCard;
  isContact: boolean;
  onChat: () => void;
  onContact?: () => void;
  onBlock?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-4">
      <Avatar name={person.displayName} />
      <div className="min-w-0 flex-1">
        <strong className="block text-sm">
          {person.displayName}
          {person.isBot ? ' · Bot' : ''}
        </strong>
        <small className="text-xs text-muted">
          @{person.username} · #{person.publicId}
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
      {onBlock && (
        <IconButton label={`Block ${person.displayName}`} onClick={onBlock}>
          <Ban size={18} />
        </IconButton>
      )}
    </div>
  );
}
