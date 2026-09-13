import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { dismiss, list, markAllRead, markRead, unreadCount } from './notifications.controller';
import {
  markReadSchema,
  notificationIdParamSchema,
  notificationsQuerySchema,
} from './notifications.schemas';

export const notificationsRoutes: Router = Router();

notificationsRoutes.use(requireAuth);

notificationsRoutes.get('/', validate('query', notificationsQuerySchema), list);
notificationsRoutes.get('/unread-count', unreadCount);
notificationsRoutes.post('/read', validate('body', markReadSchema), markRead);
notificationsRoutes.post('/read-all', markAllRead);
notificationsRoutes.delete('/:id', validate('params', notificationIdParamSchema), dismiss);
