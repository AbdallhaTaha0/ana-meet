import { describe, expect, it } from 'vitest';
import { LocalStorageBackend } from '../src/storage/local';

describe('local storage path containment', () => {
  it('rejects traversal keys before accessing files', async () => {
    const storage = new LocalStorageBackend('test-storage');
    await expect(storage.readFile('../../outside.txt')).rejects.toThrow('Invalid storage key');
    await expect(storage.saveFile('unused', '../outside.txt')).rejects.toThrow('Invalid storage key');
  });
});
