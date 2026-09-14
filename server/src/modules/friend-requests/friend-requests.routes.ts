import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { accept, cancel, list, reject, remove, send } from './friend-requests.controller';
import {
  friendRequestIdParamSchema,
  listFriendRequestsQuerySchema,
  sendFriendRequestSchema,
} from './friend-requests.schemas';

export const friendRequestsRoutes: Router = Router();

friendRequestsRoutes.use(requireAuth);
friendRequestsRoutes.get('/', validate('query', listFriendRequestsQuerySchema), list);
friendRequestsRoutes.post('/', validate('body', sendFriendRequestSchema), send);
friendRequestsRoutes.post('/:id/accept', validate('params', friendRequestIdParamSchema), accept);
friendRequestsRoutes.post('/:id/reject', validate('params', friendRequestIdParamSchema), reject);
friendRequestsRoutes.post('/:id/cancel', validate('params', friendRequestIdParamSchema), cancel);
friendRequestsRoutes.delete('/:id', validate('params', friendRequestIdParamSchema), remove);
