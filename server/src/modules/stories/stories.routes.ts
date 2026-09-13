import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { byUser, create, feed, remove } from './stories.controller';
import {
  createStorySchema,
  storiesQuerySchema,
  storyIdParamSchema,
  storyOwnerParamSchema,
} from './stories.schemas';

export const storiesRoutes: Router = Router();

storiesRoutes.use(requireAuth);
// Static segment first so '/feed' never collides with a user id.
storiesRoutes.get('/feed', validate('query', storiesQuerySchema), feed);
storiesRoutes.post('/', validate('body', createStorySchema), create);
storiesRoutes.get('/:userId', validate('params', storyOwnerParamSchema), byUser);
storiesRoutes.delete('/:storyId', validate('params', storyIdParamSchema), remove);
