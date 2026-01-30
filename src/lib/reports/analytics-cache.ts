import type { AnalyticsOverview } from "@/lib/reports/analytics";

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<
  string,
  {
    data: AnalyticsOverview;
    createdAt: number;
  }
>();

export const analyticsCacheTtlSeconds = Math.floor(CACHE_TTL_MS / 1000);

export function getAnalyticsCache(key: string) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  const ageMs = Date.now() - entry.createdAt;
  if (ageMs > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { ...entry, ageSeconds: Math.floor(ageMs / 1000) };
}

export function setAnalyticsCache(key: string, data: AnalyticsOverview) {
  cache.set(key, { data, createdAt: Date.now() });
}
