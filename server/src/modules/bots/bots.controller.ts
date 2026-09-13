import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { listBots } from './bots.service';

export const directory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const query = req.query as unknown as { limit: number; offset: number };
  const result = await listBots(query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});
