// Tiny SWR-lite for tab mounts: rapid sidebar switching reuses data fetched
// seconds ago instead of firing the full mount bundle again (aborted
// requests still count against the server rate limiter, so cancelling alone
// is not enough). Socket events and mutations always fetch fresh and refresh
// the entry, so the TTL only absorbs spam-clicks, never real updates.
interface Entry {
  at: number;
  data: unknown;
}

const store = new Map<string, Entry>();

export const FETCH_CACHE_TTL_MS = 5000;

export function readFetchCache<T>(key: string, ttlMs = FETCH_CACHE_TTL_MS): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() - entry.at > ttlMs) {
    if (entry) store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function writeFetchCache(key: string, data: unknown): void {
  store.set(key, { at: Date.now(), data });
}

export function clearFetchCache(): void {
  store.clear();
}
