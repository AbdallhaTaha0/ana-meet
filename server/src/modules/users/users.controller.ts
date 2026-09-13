import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { getProfile, searchUsers, updateMe } from './users.service';

export const search = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const query = req.query as unknown as { q: string; limit: number };
  const result = await searchUsers(req.auth.userId, query.q, query.limit);
  res.status(200).json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const params = req.params as unknown as { userId: string };
  const profile = await getProfile(req.auth.userId, params.userId);
  res.status(200).json({ user: profile });
});

export const patchMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const user = await updateMe(req.auth.userId, req.body);
  res.status(200).json({ user });
});
