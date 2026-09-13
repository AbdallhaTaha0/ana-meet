import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, errorMessage } from '../shared/api';
import type { Story } from '../shared/types';
import { useAuth } from '../features/auth/AuthProvider';
import { conversationsApi } from '../features/conversations/service';
import { StoryCard } from '../features/stories/StoryCard';
import { Button, ContentPage, EmptyState, ErrorNotice, PageHeader, TextField } from '../shared/ui';

export function StoriesPage() {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    api
      .get<{ items: Story[] }>('/api/v1/stories/feed', { params: { limit: 100 } })
      .then(({ data }) => setStories(data.items));
  useEffect(() => {
    void load().catch((cause) => setError(errorMessage(cause)));
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/v1/stories', { type: 'TEXT', content: content.trim() });
      setContent('');
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    try {
      const media = await conversationsApi.upload(file);
      if (media.type === 'FILE') throw new Error('Stories support images and videos.');
      await api.post('/api/v1/stories', {
        type: media.type,
        mediaUrl: media.url,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'Stories support images and videos.'
          ? cause.message
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api.delete(`/api/v1/stories/${id}`);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <ContentPage>
      <PageHeader
        eyebrow="For a moment"
        title="Stories"
        description="Share a thought or a glimpse of your day. Stories stay for 24 hours."
      />
      <section className="max-w-3xl rounded-xl border border-line p-5">
        <h2 className="mb-4 font-bold">Share a story</h2>
        <form
          onSubmit={(event) => {
            void create(event);
          }}
          className="grid gap-3"
        >
          <TextField
            id="story-content"
            label="Story text"
            className="min-h-24"
            maxLength={500}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="What's on your mind?"
          />
          <div className="flex flex-wrap justify-between gap-3">
            <label
              htmlFor="story-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-bold hover:bg-mist"
            >
              <Plus size={17} /> Photo or video
            </label>
            <input
              id="story-file"
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button primary disabled={busy || !content.trim()}>
              Share story
            </Button>
          </div>
        </form>
      </section>
      {error && <ErrorNotice message={error} />}
      <h2 className="mb-4 mt-9 text-lg font-bold">Recent stories</h2>
      {stories.length === 0 ? (
        <EmptyState
          title="No stories yet"
          description="Your contacts' stories will show up here."
        />
      ) : (
        <div className="grid max-w-6xl gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              owned={story.owner.id === user?.id}
              onDelete={() => {
                void remove(story.id);
              }}
            />
          ))}
        </div>
      )}
    </ContentPage>
  );
}
