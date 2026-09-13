import { z } from 'zod';
import { pageQuerySchema } from '../blocks/blocks.schemas';

export const contactBodySchema = z.object({
  contactUserId: z.string().uuid(),
});

export const contactUserIdParamSchema = z.object({
  contactUserId: z.string().uuid(),
});

export const contactsQuerySchema = pageQuerySchema;
