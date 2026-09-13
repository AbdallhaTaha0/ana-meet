import { z } from 'zod';
import { pageQuerySchema } from '../blocks/blocks.schemas';
import { usernameSchema } from '../auth/auth.schemas';

export const provisionBotSchema = z.object({
  username: usernameSchema,
  email: z.string().email().max(254).toLowerCase(),
  displayName: z.string().trim().min(1).max(80),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(280),
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

export const auditQuerySchema = pageQuerySchema;

export const usersQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  role: z.enum(['USER', 'BOT', 'ADMIN']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminUserIdParamSchema = z.object({
  id: z.string().uuid(),
});
