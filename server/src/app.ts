import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { config } from './config/env';
import { logger } from './common/logger';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { authRoutes } from './modules/auth/auth.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { blocksRoutes } from './modules/blocks/blocks.routes';
import { botsRoutes } from './modules/bots/bots.routes';
import { contactsRoutes } from './modules/contacts/contacts.routes';
import { conversationsRoutes } from './modules/conversations/conversations.routes';
import { messagesRoutes } from './modules/messages/messages.routes';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { storiesRoutes } from './modules/stories/stories.routes';
import { uploadsRoutes } from './modules/uploads/uploads.routes';
import { healthRoutes } from './modules/health/health.routes';
import { usersRoutes } from './modules/users/users.routes';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', config.trustProxyHops);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin / non-browser requests carry no Origin header.
        if (!origin) return callback(null, true);
        if (config.clientOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id = Array.isArray(existing) ? existing[0] : existing ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Never log auth material.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Infra endpoints (no rate limit / CSRF — safe GETs for LB + Docker).
  app.use('/', healthRoutes);

  // API surface.
  app.use('/api', apiLimiter);
  app.use('/api', csrfProtection);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/bots', botsRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/contacts', contactsRoutes);
  app.use('/api/v1/blocks', blocksRoutes);
  app.use('/api/v1/conversations', conversationsRoutes);
  app.use('/api/v1/conversations/:id/messages', messagesRoutes);
  app.use('/api/v1/notifications', notificationsRoutes);
  app.use('/api/v1/stories', storiesRoutes);
  app.use('/api/v1/uploads', uploadsRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
