import { z } from 'zod';
import { pageQuerySchema } from '../blocks/blocks.schemas';

export const uploadsQuerySchema = pageQuerySchema;

// Served keys are server-generated date-sharded paths; the pattern below
// plus a resolve-prefix check in the service blocks path traversal.
export const assetKeyParamSchema = z.object({
  key: z.string().min(1).max(160),
});
