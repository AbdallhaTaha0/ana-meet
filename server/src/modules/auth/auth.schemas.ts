import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .toLowerCase()
  .regex(/^[a-z0-9._-]+$/, 'Username may contain lowercase letters, digits, . _ -');

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});

export const loginSchema = z.object({
  // Username or email — error responses never reveal which one was wrong.
  identifier: z.string().min(1).max(254).toLowerCase(),
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
