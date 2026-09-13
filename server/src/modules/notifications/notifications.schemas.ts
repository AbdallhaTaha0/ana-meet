import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
  unread: z.coerce.boolean().optional(),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});
