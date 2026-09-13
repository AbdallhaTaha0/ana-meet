import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { createStory, deleteStory, listFeed, listUserStories } from './stories.service';

function authId(req: Request): string {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth.userId;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const story = await createStory(authId(req), req.body);
  res.status(201).json({ story });
});

export const feed = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { limit: number; offset: number };
  const result = await listFeed(authId(req), query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});

export const byUser = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { userId: string };
  const result = await listUserStories(authId(req), params.userId);
  res.status(200).json(result);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { storyId: string };
  await deleteStory(authId(req), params.storyId);
  res.status(204).send();
});
