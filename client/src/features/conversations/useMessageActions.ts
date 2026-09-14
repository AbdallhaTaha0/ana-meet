import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { errorMessage } from '../../shared/api';
import { useConfirm } from '../../shared/ConfirmDialog';
import type { Message } from '../../shared/types';
import { conversationsApi } from './service';

export function useMessageActions(
  conversationId: string | undefined,
  socket: RefObject<Socket | null>,
  add: (message: Message) => void,
  removeLocal: (id: string) => void,
  refreshList: () => Promise<void>,
) {
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const pendingSend = useRef<{ content: string; replyId: string | null; id: string } | null>(null);
  useEffect(() => {
    setDraft('');
    setReply(null);
    setEditing(null);
    pendingSend.current = null;
  }, [conversationId]);
  const changeDraft = (value: string) => {
    setDraft(value);
    if (conversationId)
      socket.current?.emit(value ? 'typing:start' : 'typing:stop', { conversationId });
  };
  const startEdit = (message: Message) => {
    setEditing(message);
    setReply(null);
    setDraft(message.content || '');
  };
  const cancelContext = () => {
    setReply(null);
    setEditing(null);
    setDraft('');
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!conversationId || !draft.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      if (editing) {
        add(await conversationsApi.edit(conversationId, editing.id, draft.trim()));
        setEditing(null);
      } else {
        const content = draft.trim();
        const replyId = reply?.id || null;
        if (pendingSend.current?.content !== content || pendingSend.current.replyId !== replyId)
          pendingSend.current = { content, replyId, id: crypto.randomUUID() };
        add(
          await conversationsApi.send(conversationId, {
            type: 'TEXT',
            content,
            clientMessageId: pendingSend.current.id,
            ...(replyId ? { replyToMessageId: replyId } : {}),
          }),
        );
        pendingSend.current = null;
        setReply(null);
        void refreshList();
      }
      setDraft('');
      socket.current?.emit('typing:stop', { conversationId });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!conversationId) return;
    setBusy(true);
    setError('');
    try {
      const media = await conversationsApi.upload(file);
      add(
        await conversationsApi.send(conversationId, {
          type: media.type,
          mediaUrl: media.url,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          fileName: media.fileName,
          clientMessageId: crypto.randomUUID(),
          ...(reply ? { replyToMessageId: reply.id } : {}),
        }),
      );
      setReply(null);
      void refreshList();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(message: Message) {
    if (!conversationId) return;
    const ok = await confirm({
      title: 'Delete message?',
      description: 'This message will be permanently deleted for everyone in this chat.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await conversationsApi.remove(conversationId, message.id);
      removeLocal(message.id);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return {
    draft,
    reply,
    editing,
    busy,
    error,
    setError,
    changeDraft,
    setReply,
    startEdit,
    cancelContext,
    submit,
    upload,
    remove,
  };
}
