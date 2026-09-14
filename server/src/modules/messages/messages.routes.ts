import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { edit, history, readAll, remove, send, setStatus } from './messages.controller';
import {
  conversationIdParamSchema,
  editMessageSchema,
  historyQuerySchema,
  messageIdParamSchema,
  messageStatusSchema,
  sendMessageSchema,
} from './messages.schemas';

// Merged into /api/v1/conversations/:id/messages (parent :id validated here).
export const messagesRoutes: Router = Router({ mergeParams: true });

messagesRoutes.use(requireAuth);

messagesRoutes.post('/', validate('params', conversationIdParamSchema), validate('body', sendMessageSchema), send);
messagesRoutes.get(
  '/',
  validate('params', conversationIdParamSchema),
  validate('query', historyQuerySchema),
  history,
);
messagesRoutes.patch(
  '/:messageId',
  validate('params', messageIdParamSchema),
  validate('body', editMessageSchema),
  edit,
);
messagesRoutes.delete('/:messageId', validate('params', messageIdParamSchema), remove);
messagesRoutes.post(
  '/read',
  validate('params', conversationIdParamSchema),
  readAll,
);
messagesRoutes.post(
  '/:messageId/status',
  validate('params', messageIdParamSchema),
  validate('body', messageStatusSchema),
  setStatus,
);
