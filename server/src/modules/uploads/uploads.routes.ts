import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { Errors } from '../../common/errors';
import { requireAuth } from '../../middleware/requireAuth';
import { uploadLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { pageQuerySchema } from '../blocks/blocks.schemas';
import { getStorage } from '../../storage';
import { create, list, read, remove } from './uploads.controller';

export const uploadsRoutes: Router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const dir = getStorage().systemTmp();
      fs.mkdir(dir, { recursive: true }).then(() => callback(null, dir), (cause: unknown) => callback(cause as Error, dir));
    },
    filename: (_req, _file, callback) => callback(null, randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: 105_000_000, files: 1, fields: 0 },
});

uploadsRoutes.use(requireAuth);
uploadsRoutes.get('/', validate('query', pageQuerySchema), list);
uploadsRoutes.post('/', uploadLimiter, (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error) { next(Errors.badRequest('Invalid upload')); return; }
    next();
  });
}, create);
uploadsRoutes.get('/:year/:month/:file', read);
uploadsRoutes.delete('/:year/:month/:file', remove);
