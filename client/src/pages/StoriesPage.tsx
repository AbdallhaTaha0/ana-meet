import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api, errorMessage, isRequestAbort } from '../shared/api';
import { readFetchCache, writeFetchCache } from '../shared/fetchCache';
import type { Story } from '../shared/types';
import { useAuth } from '../features/auth/AuthProvider';
import { conversationsApi } from '../features/conversations/service';
import { useRealtimeSocket } from '../features/realtime/RealtimeProvider';
import { StoryCard } from '../features/stories/StoryCard';
import { Button, ContentPage, EmptyState, ErrorNotice, PageHeader, TextField } from '../shared/ui';

export function StoriesPage() {
  const { user } = useAuth();
  const socket = useRealtimeSocket();
  const [stories, setStories] = useState<Story[]>([]);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    (signal?: AbortSignal) =>
      api
        .get<{ items: Story[] }>('/api/v1/stories/feed', { params: { limit: 100 }, signal })
        .then(({ data }) => {
          writeFetchCache('stories:feed', data.items);
          setStories(data.items);
        }),
    [],
  );
  useEffect(() => {
    const cached = readFetchCache<Story[]>('stories:feed');
    if (cached) {
      setStories(cached);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (!isRequestAbort(cause)) setError(errorMessage(cause));
    });
    return () => controller.abort();
  }, [load]);

  // Live feed: insert on story:new, remove on story:deleted, refetch on reconnect.
  useEffect(() => {
    const onNew = ({ story }: { story: Story }) => {
      setStories((old) => {
        if (old.some((s) => s.id === story.id)) return old;
        return [story, ...old].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
      });
    };
    const onDeleted = ({ storyId }: { storyId: string }) => {
      setStories((old) => old.filter((s) => s.id !== storyId));
    };
    const onConnect = () => {
      void load().catch(() => undefined);
    };
    socket.on('story:new', onNew);
    socket.on('story:deleted', onDeleted);
    socket.on('connect', onConnect);
    return () => {
      socket.off('story:new', onNew);
      socket.off('story:deleted', onDeleted);
      socket.off('connect', onConnect);
    };
  }, [load, socket]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function pick(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  // One form, one story: text-only, media-only, or text + media together.
  async function share(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() && !file) return;
    setBusy(true);
    try {
      if (!file) {
        await api.post('/api/v1/stories', { type: 'TEXT', content: content.trim() });
      } else {
        const media = await conversationsApi.upload(file);
        if (media.type === 'FILE') throw new Error('Stories support images and videos.');
        await api.post('/api/v1/stories', {
          type: media.type,
          mediaUrl: media.url,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          ...(content.trim() ? { content: content.trim() } : {}),
        });
      }
      setContent('');
      pick(null);
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
  const remove = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/v1/stories/${id}`);
      setStories((old) => old.filter((s) => s.id !== id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);
  const canShare = Boolean(content.trim() || file) && !busy;
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
            void share(event);
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
          {preview && file && (
            <div className="relative">
              {file.type.startsWith('video/') ? (
                <video className="max-h-60 w-full rounded-lg" controls src={preview} />
              ) : (
                <img
                  className="max-h-60 w-full rounded-lg object-cover"
                  src={preview}
                  alt="Story attachment preview"
                />
              )}
              <Button className="absolute right-2 top-2" onClick={() => pick(null)}>
                <X size={16} /> Remove
              </Button>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <label
              htmlFor="story-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-bold hover:bg-mist"
            >
              <ImagePlus size={17} /> {file ? 'Change photo or video' : 'Photo or video (optional)'}
            </label>
            <input
              id="story-file"
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
              onChange={(event) => {
                pick(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            <Button primary disabled={!canShare}>
              {busy ? 'Sharing…' : 'Share story'}
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
              onDelete={remove}
            />
          ))}
        </div>
      )}
    </ContentPage>
  );
}
