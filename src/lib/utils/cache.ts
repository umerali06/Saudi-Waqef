type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = Number.parseInt(process.env.CACHE_TTL_MS ?? "60000", 10) || 60000;
const cache = new Map<string, CacheEntry<unknown>>();

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidateCache(key: string) {
  cache.delete(key);
}

export function invalidateCacheByPrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
