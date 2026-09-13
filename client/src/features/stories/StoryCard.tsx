import { Trash2 } from 'lucide-react';
import { mediaUrl } from '../../shared/api';
import type { Story } from '../../shared/types';
import { Avatar, IconButton } from '../../shared/ui';

export function StoryCard({
  story,
  owned,
  onDelete,
}: {
  story: Story;
  owned: boolean;
  onDelete: () => void;
}) {
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
        (story.type === 'IMAGE' ? (
          <img
            className="mt-4 max-h-80 w-full rounded-lg object-cover"
            src={mediaUrl(story.media.url)}
            alt={`Story by ${story.owner.displayName}`}
            loading="lazy"
          />
        ) : (
          <video
            className="mt-4 max-h-80 w-full rounded-lg"
            controls
            src={mediaUrl(story.media.url)}
          />
        ))}
    </article>
  );
}
