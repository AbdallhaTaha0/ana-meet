import { z } from 'zod';
import { pageQuerySchema } from '../blocks/blocks.schemas';

export const createDirectSchema = z.object({
  peerId: z.string().uuid(),
});

export const createGroupSchema = z.object({
  title: z.string().trim().min(1).max(100),
  memberIds: z.array(z.string().uuid()).min(1).max(199),
});

export const conversationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const memberParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(199),
});

export const renameGroupSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export const transferOwnershipSchema = z.object({
  userId: z.string().uuid(),
});

export const conversationsQuerySchema = pageQuerySchema;
