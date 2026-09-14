import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { publishConversationEvent } from '../../realtime/publish';
import {
  advanceMessageStatus,
  deleteMessage,
  editMessage,
  listMessages,
  markConversationRead,
  sendMessage,
} from './messages.service';

function auth(req: Request): { userId: string; role: string } {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth;
}

export const send = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = auth(req);
  const params = req.params as unknown as { id: string };
  const { message, created } = await sendMessage(userId, params.id, req.body);
  if (created) await publishConversationEvent(params.id, 'message:new', { message });
  res.status(created ? 201 : 200).json({ message });
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = auth(req);
  const params = req.params as unknown as { id: string };
  const query = req.query as unknown as { limit: number; cursor?: string };
  const result = await listMessages(userId, params.id, query.limit, query.cursor);
  res.status(200).json({ ...result, limit: query.limit });
});

export const edit = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = auth(req);
  const params = req.params as unknown as { id: string; messageId: string };
  const message = await editMessage(userId, params.id, params.messageId, req.body.content as string);
  await publishConversationEvent(params.id, 'message:updated', { message });
  res.status(200).json({ message });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { userId, role } = auth(req);
  const params = req.params as unknown as { id: string; messageId: string };
  await deleteMessage(userId, role, params.id, params.messageId);
  await publishConversationEvent(params.id, 'message:deleted', {
    conversationId: params.id,
    messageId: params.messageId,
  });
  res.status(204).send();
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = auth(req);
  const params = req.params as unknown as { id: string; messageId: string };
  const message = await advanceMessageStatus(userId, params.id, params.messageId, req.body.status);
  await publishConversationEvent(params.id, 'message:status', {
    conversationId: params.id,
    messageId: message.id,
    status: message.status,
  });
  res.status(200).json({ message });
});

export const readAll = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = auth(req);
  const params = req.params as unknown as { id: string };
  const result = await markConversationRead(userId, params.id);
  // Same per-message status contract as individual receipts, one cheap
  // socket emit each (no HTTP storm for the reader).
  for (const messageId of result.messageIds) {
    // eslint-disable-next-line no-await-in-loop
    await publishConversationEvent(params.id, 'message:status', {
      conversationId: params.id,
      messageId,
      status: 'READ',
    });
  }
  res.status(200).json({ updated: result.updated });
});
