import { createReadStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve, sep } from 'path';
import type { StorageBackend } from './types';

// Local filesystem backend for development/small deployments.
// Layout: <root>/files/<key> (keys are date-sharded server paths) and
// <root>/tmp for in-flight multipart bodies. Production object storage
// replaces this class, not its callers.
export class LocalStorageBackend implements StorageBackend {
  readonly rootDir: string;
  readonly tmpDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.tmpDir = join(rootDir, 'tmp');
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'files'), { recursive: true });
    await fs.mkdir(this.tmpDir, { recursive: true });
  }

  private abs(key: string): string {
    const filesRoot = resolve(this.rootDir, 'files');
    const target = resolve(filesRoot, key);
    if (!target.startsWith(filesRoot + sep)) throw new Error('Invalid storage key');
    return target;
  }

  async saveFile(tmpPath: string, key: string): Promise<void> {
    const dest = this.abs(key);
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.rename(tmpPath, dest);
  }

  async deleteFile(key: string): Promise<void> {
    await fs.unlink(this.abs(key)).catch(() => undefined);
  }

  async readFile(key: string): Promise<{ stream: NodeJS.ReadableStream; sizeBytes: number }> {
    const stat = await fs.stat(this.abs(key));
    return { stream: createReadStream(this.abs(key)), sizeBytes: stat.size };
  }

  urlPathFor(key: string): string {
    return `/api/v1/uploads/${key}`;
  }

  systemTmp(): string {
    return this.tmpDir || tmpdir();
  }
}
