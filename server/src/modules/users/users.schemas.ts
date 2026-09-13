import { z } from 'zod';
import { usernameSchema } from '../auth/auth.schemas';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const updateMeSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => v.username !== undefined || v.displayName !== undefined, {
    message: 'Provide username and/or displayName',
  });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
