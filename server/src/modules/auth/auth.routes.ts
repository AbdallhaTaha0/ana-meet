import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { validate } from '../../middleware/validate';
import { authLimiter } from '../../middleware/rateLimit';
import { login, logout, logoutAll, me, refresh, register } from './auth.controller';
import { loginSchema, registerSchema } from './auth.schemas';

export const authRoutes: Router = Router();

// Brute-force sensitive endpoints share a strict per-IP limiter.
authRoutes.post('/register', authLimiter, validate('body', registerSchema), register);
authRoutes.post('/login', authLimiter, validate('body', loginSchema), login);
authRoutes.post('/refresh', authLimiter, refresh);
authRoutes.post('/logout', logout);
authRoutes.post('/logout-all', requireAuth, logoutAll);
authRoutes.get('/me', requireAuth, me);
