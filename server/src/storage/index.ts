import { config } from '../config/env';
import { LocalStorageBackend } from './local';
import type { StorageBackend } from './types';

let backend: StorageBackend | null = null;

// Single seam for backend selection. To move to object storage, construct
// the S3/GCS implementation here behind an env flag — callers stay untouched.
export function getStorage(): LocalStorageBackend {
  if (backend) return backend as LocalStorageBackend;
  const instance = new LocalStorageBackend(config.uploadDir);
  backend = instance;
  return instance;
}

export async function ensureStorageDirs(): Promise<void> {
  await getStorage().ensureDirs();
}

export type { StorageBackend };
