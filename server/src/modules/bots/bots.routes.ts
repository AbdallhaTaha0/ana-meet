import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { pageQuerySchema } from '../blocks/blocks.schemas';
import { directory } from './bots.controller';

export const botsRoutes: Router = Router();

botsRoutes.use(requireAuth);
botsRoutes.get('/', validate('query', pageQuerySchema), directory);
