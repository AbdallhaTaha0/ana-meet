import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import {
  addMembers,
  createDirectConversation,
  createGroupConversation,
  getConversationDetail,
  hideConversation,
  leaveConversation,
  listMyConversations,
  muteConversation,
  removeMember,
  renameGroup,
  transferOwnership,
  unhideConversation,
  unmuteConversation,
} from './conversations.service';

function authId(req: Request): string {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth.userId;
}

export const createDirect = asyncHandler(async (req: Request, res: Response) => {
  const { conversation, created } = await createDirectConversation(authId(req), req.body.peerId as string);
  res.status(created ? 201 : 200).json({ conversation });
});

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const { conversation } = await createGroupConversation(
    authId(req),
    req.body.title as string,
    req.body.memberIds as string[],
  );
  res.status(201).json({ conversation });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { limit: number; offset: number };
  const result = await listMyConversations(authId(req), query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const conversation = await getConversationDetail(authId(req), params.id);
  res.status(200).json({ conversation });
});

export const add = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await addMembers(authId(req), params.id, req.body.userIds as string[]);
  res.status(200).json(result);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string; userId: string };
  await removeMember(authId(req), params.id, params.userId);
  res.status(204).send();
});

export const leave = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await leaveConversation(authId(req), params.id);
  res.status(200).json(result);
});

export const rename = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const conversation = await renameGroup(authId(req), params.id, req.body.title as string);
  res.status(200).json({ conversation });
});

export const transfer = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const conversation = await transferOwnership(authId(req), params.id, req.body.userId as string);
  res.status(200).json({ conversation });
});

export const hide = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await hideConversation(authId(req), params.id);
  res.status(200).json(result);
});

export const unhide = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await unhideConversation(authId(req), params.id);
  res.status(200).json(result);
});

export const mute = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await muteConversation(authId(req), params.id);
  res.status(200).json(result);
});

export const unmute = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await unmuteConversation(authId(req), params.id);
  res.status(200).json(result);
});
