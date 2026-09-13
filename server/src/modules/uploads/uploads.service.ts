import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { basename } from 'path';
import { MediaAsset } from '../../db/models';
import { config } from '../../config/env';
import { Errors } from '../../common/errors';
import { detectMedia } from '../../storage/detect';
import { getStorage } from '../../storage';

const MAX_BYTES = { IMAGE: 10_000_000, VIDEO: 100_000_000, FILE: 50_000_000 } as const;
const KEY_PATTERN = /^\d{4}\/\d{2}\/[a-f0-9]{32}\.(jpg|png|gif|webp|mp4|webm|pdf|zip|doc|txt)$/;

export interface MediaView {
  key: string;
  url: string;
  urlPath: string;
  mimeType: string;
  type: 'IMAGE' | 'VIDEO' | 'FILE';
  sizeBytes: number;
  fileName: string;
}

function view(asset: MediaAsset): MediaView {
  const urlPath = getStorage().urlPathFor(asset.id);
  return {
    key: asset.id,
    url: new URL(urlPath, config.publicOrigin).toString(),
    urlPath,
    mimeType: asset.mimeType,
    type: asset.kind,
    sizeBytes: Number(asset.sizeBytes),
    fileName: asset.fileName || 'file',
  };
}

function cleanName(name: string): string {
  return basename(name).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').slice(0, 255) || 'file';
}

export function validKey(key: string): boolean { return KEY_PATTERN.test(key); }

export async function saveUpload(ownerId: string, file: Express.Multer.File): Promise<MediaView> {
  const storage = getStorage();
  try {
    const handle = await fs.open(file.path, 'r');
    const sizeBytes = (await handle.stat()).size;
    const sample = Buffer.alloc(Math.min(sizeBytes, 8192));
    try { await handle.read(sample, 0, sample.length, 0); } finally { await handle.close(); }
    const detected = detectMedia(sample, sample);
    if (!detected || sizeBytes === 0 || sizeBytes > MAX_BYTES[detected.kind]) {
      throw Errors.badRequest('Unsupported or oversized file');
    }
    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(16).toString('hex')}.${detected.extension}`;
    await storage.saveFile(file.path, key);
    try {
      const asset = await MediaAsset.create({ id: key, ownerId, mimeType: detected.mimeType, kind: detected.kind, sizeBytes, fileName: cleanName(file.originalname) });
      return view(asset);
    } catch (cause) {
      await storage.deleteFile(key);
      throw cause;
    }
  } finally {
    await fs.unlink(file.path).catch(() => undefined);
  }
}

export async function listUploads(ownerId: string, limit: number, offset: number) {
  const { rows, count } = await MediaAsset.findAndCountAll({ where: { ownerId }, order: [['createdAt', 'DESC']], limit, offset });
  return { items: rows.map(view), total: count };
}

export async function getUpload(key: string): Promise<MediaAsset> {
  if (!validKey(key)) throw Errors.notFound('File not found');
  const asset = await MediaAsset.findByPk(key);
  if (!asset) throw Errors.notFound('File not found');
  return asset;
}

export async function deleteUpload(key: string, userId: string, role: string): Promise<void> {
  const asset = await getUpload(key);
  if (asset.ownerId !== userId && role !== 'ADMIN') throw Errors.forbidden('Only the owner can delete this file');
  await asset.destroy();
  await getStorage().deleteFile(key);
}
