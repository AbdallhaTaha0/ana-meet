import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  listFriendRequests,
  rejectFriendRequest,
  removeFriendRequest,
  sendFriendRequest,
} from './friend-requests.service';

function authId(req: Request): string {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth.userId;
}

export const send = asyncHandler(async (req: Request, res: Response) => {
  const { request, created } = await sendFriendRequest(authId(req), req.body.addresseeId as string);
  res.status(created ? 201 : 200).json({ request });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    limit: number;
    offset: number;
    direction: 'inbound' | 'outbound' | 'all';
    status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  };
  const result = await listFriendRequests(authId(req), query.direction, query.status, query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await acceptFriendRequest(authId(req), params.id);
  res.status(200).json(result);
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await rejectFriendRequest(authId(req), params.id);
  res.status(200).json(result);
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await cancelFriendRequest(authId(req), params.id);
  res.status(200).json(result);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  await removeFriendRequest(authId(req), params.id);
  res.status(204).send();
});
