import { useRef, type FormEvent } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import type { Message } from '../../shared/types';
import { IconButton } from '../../shared/ui';

export function MessageComposer({
  draft,
  busy,
  reply,
  editing,
  onDraft,
  onSubmit,
  onUpload,
  onCancel,
}: {
  draft: string;
  busy: boolean;
  reply: Message | null;
  editing: Message | null;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onUpload: (file: File) => void;
  onCancel: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="border-t border-line bg-white">
      {(reply || editing) && (
        <div className="flex items-center justify-between px-4 text-xs text-muted">
          <span>
            {editing ? 'Editing message' : `Replying to ${reply?.sender?.displayName || 'message'}`}
          </span>
          <IconButton label="Cancel" onClick={onCancel}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      <form className="flex items-center gap-2 px-3 py-3 md:px-8" onSubmit={onSubmit}>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          aria-label="Attach file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = '';
          }}
        />
        <IconButton label="Attach file" disabled={busy} onClick={() => fileInput.current?.click()}>
          <ImagePlus size={22} />
        </IconButton>
        <label className="sr-only" htmlFor="message-draft">
          Write a message
        </label>
        <textarea
          id="message-draft"
          rows={1}
          maxLength={4000}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border-0 bg-paper px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sea"
          placeholder="Write a message…"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-sea text-white hover:bg-sea-dark disabled:opacity-50"
          type="submit"
          aria-label="Send message"
          disabled={busy || !draft.trim()}
        >
          <Send size={19} />
        </button>
      </form>
    </div>
  );
}
