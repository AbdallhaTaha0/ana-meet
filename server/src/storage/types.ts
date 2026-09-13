// Storage seam: business logic depends on this interface, never on the
// local filesystem. A future object-storage backend (S3/GCS) implements
// these three methods and plugs in via getStorage() — no caller changes.
export interface StorageBackend {
  // Persist a validated temp file at `key`. Must be atomic where possible.
  saveFile(tmpPath: string, key: string): Promise<void>;
  // Best-effort removal; resolves even when the object is already gone.
  deleteFile(key: string): Promise<void>;
  // Absolute byte stream for serving. Rejects when the object is missing.
  readFile(key: string): Promise<{ stream: NodeJS.ReadableStream; sizeBytes: number }>;
  // Public path (not absolute URL — callers absolutize from the request).
  urlPathFor(key: string): string;
}
