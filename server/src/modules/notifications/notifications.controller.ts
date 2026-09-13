import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  unreadNotificationCount,
} from './notifications.service';

function authId(req: Request): string {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth.userId;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { limit: number; cursor?: string; unread?: boolean };
  const result = await listNotifications(authId(req), query.limit, query.cursor, query.unread ?? false);
  res.status(200).json({ ...result, limit: query.limit });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await markNotificationsRead(authId(req), req.body.ids as string[]);
  res.status(200).json(result);
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await markAllNotificationsRead(authId(req));
  res.status(200).json(result);
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  const result = await unreadNotificationCount(authId(req));
  res.status(200).json(result);
});

export const dismiss = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  await dismissNotification(authId(req), params.id);
  res.status(204).send();
});
