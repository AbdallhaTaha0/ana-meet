import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { blockUser, listBlocks, unblockUser } from './blocks.service';

export const block = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const { blocked, created } = await blockUser(req.auth.userId, req.body.blockedUserId as string);
  res.status(created ? 201 : 200).json({ blocked });
});

export const unblock = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const params = req.params as unknown as { blockedUserId: string };
  await unblockUser(req.auth.userId, params.blockedUserId);
  res.status(204).send();
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const query = req.query as unknown as { limit: number; offset: number };
  const result = await listBlocks(req.auth.userId, query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});
