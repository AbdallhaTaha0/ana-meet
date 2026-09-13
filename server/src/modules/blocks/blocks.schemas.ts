import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const blockBodySchema = z.object({
  blockedUserId: z.string().uuid(),
});

export const blockedUserIdParamSchema = z.object({
  blockedUserId: z.string().uuid(),
});

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
