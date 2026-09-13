import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { announce, auditLog, createBot, disable, remove, restore, stats, userDetail, users } from './admin.controller';
import {
  adminUserIdParamSchema,
  announcementSchema,
  auditQuerySchema,
  provisionBotSchema,
  usersQuerySchema,
} from './admin.schemas';

export const adminRoutes: Router = Router();

// Every admin operation re-verifies the ADMIN role server-side per request;
// client claims are never trusted. Sensitive actions write audit records.
adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.post('/bots', validate('body', provisionBotSchema), createBot);
adminRoutes.post('/announcements', validate('body', announcementSchema), announce);
adminRoutes.get('/audit-log', validate('query', auditQuerySchema), auditLog);
adminRoutes.get('/stats', stats);
adminRoutes.get('/users', validate('query', usersQuerySchema), users);
adminRoutes.get('/users/:id', validate('params', adminUserIdParamSchema), userDetail);
adminRoutes.post('/users/:id/disable', validate('params', adminUserIdParamSchema), disable);
adminRoutes.post('/users/:id/restore', validate('params', adminUserIdParamSchema), restore);
adminRoutes.delete('/users/:id', validate('params', adminUserIdParamSchema), remove);
