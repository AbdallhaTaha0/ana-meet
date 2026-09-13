import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import {
  deleteUser,
  disableUser,
  getUserDetail,
  listAuditLog,
  listUsers,
  platformStats,
  provisionBot,
  restoreUser,
  sendAnnouncement,
} from './admin.service';

function adminId(req: Request): string {
  if (!req.auth) throw Errors.unauthorized();
  return req.auth.userId;
}

export const createBot = asyncHandler(async (req: Request, res: Response) => {
  const result = await provisionBot(adminId(req), req.body);
  res.status(201).json(result);
});

export const announce = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendAnnouncement(adminId(req), req.body);
  res.status(201).json(result);
});

export const auditLog = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { limit: number; offset: number };
  const result = await listAuditLog(query.limit, query.offset);
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});

export const users = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    search?: string;
    status?: 'ACTIVE' | 'DISABLED';
    role?: 'USER' | 'BOT' | 'ADMIN';
    limit: number;
    offset: number;
  };
  const result = await listUsers(
    { search: query.search, status: query.status, role: query.role },
    query.limit,
    query.offset,
  );
  res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
});

export const userDetail = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const result = await getUserDetail(params.id);
  res.status(200).json(result);
});

export const disable = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const user = await disableUser(adminId(req), params.id);
  res.status(200).json({ user });
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  const user = await restoreUser(adminId(req), params.id);
  res.status(200).json({ user });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = req.params as unknown as { id: string };
  await deleteUser(adminId(req), params.id);
  res.status(204).send();
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await platformStats());
});
