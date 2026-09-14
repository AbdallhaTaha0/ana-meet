import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import {
  add,
  createDirect,
  createGroup,
  getById,
  hide,
  leave,
  list,
  mute,
  remove,
  rename,
  transfer,
  unhide,
  unmute,
} from './conversations.controller';
import {
  addMembersSchema,
  conversationIdParamSchema,
  conversationsQuerySchema,
  createDirectSchema,
  createGroupSchema,
  memberParamSchema,
  renameGroupSchema,
  transferOwnershipSchema,
} from './conversations.schemas';

export const conversationsRoutes: Router = Router();

conversationsRoutes.use(requireAuth);

conversationsRoutes.post('/direct', validate('body', createDirectSchema), createDirect);
conversationsRoutes.post('/group', validate('body', createGroupSchema), createGroup);
conversationsRoutes.get('/', validate('query', conversationsQuerySchema), list);
conversationsRoutes.get('/:id', validate('params', conversationIdParamSchema), getById);
conversationsRoutes.post(
  '/:id/members',
  validate('params', conversationIdParamSchema),
  validate('body', addMembersSchema),
  add,
);
conversationsRoutes.delete(
  '/:id/members/:userId',
  validate('params', memberParamSchema),
  remove,
);
conversationsRoutes.post(
  '/:id/leave',
  validate('params', conversationIdParamSchema),
  leave,
);
conversationsRoutes.post(
  '/:id/hide',
  validate('params', conversationIdParamSchema),
  hide,
);
conversationsRoutes.post(
  '/:id/unhide',
  validate('params', conversationIdParamSchema),
  unhide,
);
conversationsRoutes.post(
  '/:id/mute',
  validate('params', conversationIdParamSchema),
  mute,
);
conversationsRoutes.post(
  '/:id/unmute',
  validate('params', conversationIdParamSchema),
  unmute,
);
conversationsRoutes.patch(
  '/:id',
  validate('params', conversationIdParamSchema),
  validate('body', renameGroupSchema),
  rename,
);
conversationsRoutes.post(
  '/:id/transfer',
  validate('params', conversationIdParamSchema),
  validate('body', transferOwnershipSchema),
  transfer,
);
