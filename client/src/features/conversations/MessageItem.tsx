import { Check, CheckCheck } from 'lucide-react';
import type { Message } from '../../shared/types';
import { useObjectMedia } from '../../shared/useObjectMedia';

interface Props {
  message: Message;
  mine: boolean;
  showSender: boolean;
  canDelete: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
}

export function MessageItem({
  message,
  mine,
  showSender,
  canDelete,
  onReply,
  onEdit,
  onDelete,
}: Props) {
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(message.createdAt),
  );
  const media = useObjectMedia(message.media?.url);
  return (
    <article
      className={`flex max-w-[86%] flex-col gap-1 md:max-w-[75%] ${mine ? 'self-end items-end' : 'items-start'}`}
    >
      <div
        className={`max-w-full break-words rounded-2xl border px-4 pb-2 pt-3 ${mine ? 'rounded-br-sm border-mist bg-mist' : 'rounded-bl-sm border-line bg-white'}`}
      >
        {showSender && (
          <strong className="mb-1 block text-xs text-sea">
            {message.sender?.displayName || 'Former member'}
          </strong>
        )}
        {message.replyTo && (
          <div className="mb-2 border-l-2 border-sea pl-2 text-xs text-muted">
            {message.replyTo.sender?.displayName || 'Message'} · {message.replyTo.snippet}
          </div>
        )}
        {message.content && (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        )}
        {message.media &&
          (media.failed ? (
            <span className="text-xs text-muted">Attachment unavailable.</span>
          ) : media.loading || !media.src ? (
            <span className="text-xs text-muted">Loading attachment…</span>
          ) : message.type === 'IMAGE' ? (
            <img
              className="max-h-80 rounded-lg"
              src={media.src}
              alt={message.media.fileName || 'Shared image'}
              loading="lazy"
            />
          ) : message.type === 'VIDEO' ? (
            <video className="max-h-80 rounded-lg" controls src={media.src} />
          ) : (
            <a
              className="text-sm text-sea underline"
              href={media.src}
              target="_blank"
              rel="noreferrer"
              download={message.media.fileName || undefined}
            >
              {message.media.fileName || 'Download file'}
            </a>
          ))}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted">
          <time>{time}</time>
          {message.editedAt && <span>edited</span>}
          {mine &&
            (message.status === 'READ' ? (
              <CheckCheck size={14} aria-label="Read" />
            ) : (
              <Check size={14} aria-label={message.status === 'DELIVERED' ? 'Delivered' : 'Sent'} />
            ))}
        </div>
      </div>
      <div className="flex gap-3 text-xs text-muted">
        <button onClick={() => onReply(message)} className="hover:text-sea hover:underline">
          Reply
        </button>
        {mine && message.type === 'TEXT' && (
          <button onClick={() => onEdit(message)} className="hover:text-sea hover:underline">
            Edit
          </button>
        )}
        {canDelete && (
          <button onClick={() => onDelete(message)} className="hover:text-danger hover:underline">
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
