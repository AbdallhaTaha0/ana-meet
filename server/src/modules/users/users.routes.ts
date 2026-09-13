import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { getById, patchMe, search } from './users.controller';
import { searchQuerySchema, updateMeSchema, userIdParamSchema } from './users.schemas';

export const usersRoutes: Router = Router();

usersRoutes.use(requireAuth);
// Static segments first: '/search' must not be captured by '/:userId'.
usersRoutes.get('/search', validate('query', searchQuerySchema), search);
usersRoutes.patch('/me', validate('body', updateMeSchema), patchMe);
usersRoutes.get('/:userId', validate('params', userIdParamSchema), getById);
