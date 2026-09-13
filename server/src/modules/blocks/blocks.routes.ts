import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { block, list, unblock } from './blocks.controller';
import {
  blockBodySchema,
  blockedUserIdParamSchema,
  pageQuerySchema,
} from './blocks.schemas';

export const blocksRoutes: Router = Router();

blocksRoutes.use(requireAuth);
blocksRoutes.get('/', validate('query', pageQuerySchema), list);
blocksRoutes.post('/', validate('body', blockBodySchema), block);
blocksRoutes.delete('/:blockedUserId', validate('params', blockedUserIdParamSchema), unblock);
