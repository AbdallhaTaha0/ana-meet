import { z } from 'zod';
import { pageQuerySchema } from '../blocks/blocks.schemas';

export const sendFriendRequestSchema = z.object({
  addresseeId: z.string().uuid(),
});

export const friendRequestIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listFriendRequestsQuerySchema = pageQuerySchema.extend({
  direction: z.enum(['inbound', 'outbound', 'all']).default('all'),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED']).optional(),
});

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type ListFriendRequestsQuery = z.infer<typeof listFriendRequestsQuerySchema>;
