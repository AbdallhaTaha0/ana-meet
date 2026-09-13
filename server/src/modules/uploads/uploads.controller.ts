import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/asyncHandler';
import { Errors } from '../../common/errors';
import { getStorage } from '../../storage';
import { assertCanReadUpload } from './uploads.access';
import { deleteUpload, getUpload, listUploads, saveUpload } from './uploads.service';

function keyFrom(req: Request): string {
  return `${req.params.year}/${req.params.month}/${req.params.file}`;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  if (!req.file) throw Errors.badRequest('Choose a file to upload');
  const media = await saveUpload(req.auth.userId, req.file);
  res.status(201).json({ media });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const { limit, offset } = req.query as unknown as { limit: number; offset: number };
  res.json({ ...(await listUploads(req.auth.userId, limit, offset)), limit, offset });
});

export const read = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const key = keyFrom(req);
  const asset = await getUpload(key);
  await assertCanReadUpload(asset, req.auth.userId, req.auth.role);
  let file;
  try { file = await getStorage().readFile(key); }
  catch { throw Errors.notFound('File not found'); }
  if (asset.kind === 'FILE') res.attachment(asset.fileName || 'file');
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', file.sizeBytes);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');
  res.setHeader('Cache-Control', 'private, max-age=300');
  file.stream.on('error', (cause) => res.destroy(cause));
  file.stream.pipe(res);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  await deleteUpload(keyFrom(req), req.auth.userId, req.auth.role);
  res.status(204).send();
});
