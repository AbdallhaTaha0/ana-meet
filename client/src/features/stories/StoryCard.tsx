import { Trash2 } from 'lucide-react';
import type { Story } from '../../shared/types';
import { Avatar, IconButton } from '../../shared/ui';
import { useObjectMedia } from '../../shared/useObjectMedia';

export function StoryCard({
  story,
  owned,
  onDelete,
}: {
  story: Story;
  owned: boolean;
  onDelete: () => void;
}) {
  const media = useObjectMedia(story.media?.url);
  return (
    <article className="rounded-xl border border-line p-5">
      <div className="flex items-center gap-3">
        <Avatar name={story.owner.displayName} small />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm">{story.owner.displayName}</strong>
          <time className="text-xs text-muted">
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(story.createdAt),
            )}
          </time>
        </div>
        {owned && (
          <IconButton label="Delete story" onClick={onDelete}>
            <Trash2 size={17} />
          </IconButton>
        )}
      </div>
      {story.content && (
        <p className="mt-5 min-h-24 break-words text-lg leading-7">{story.content}</p>
      )}
      {story.media &&
        (media.failed ? (
          <p role="alert" className="mt-4 rounded-lg bg-mist p-3 text-sm text-muted">
            This attachment is unavailable. It may have expired or you may not have access.
          </p>
        ) : media.loading || !media.src ? (
          <p role="status" className="mt-4 rounded-lg bg-paper p-3 text-sm text-muted">
            Loading attachment…
          </p>
        ) : story.type === 'IMAGE' ? (
          <img
            className="mt-4 max-h-80 w-full rounded-lg object-cover"
            src={media.src}
            alt={`Story by ${story.owner.displayName}`}
            loading="lazy"
          />
        ) : (
          <video className="mt-4 max-h-80 w-full rounded-lg" controls src={media.src} />
        ))}
    </article>
  );
}
