type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/**
 * Sliding-window limiter kept in memory (the app runs as a single process).
 * Returns true when the action is allowed and records the hit.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}

export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    const xff = headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
    const real = headers.get('x-real-ip') ?? headers.get('cf-connecting-ip');
    if (real) return real.trim();
  }
  return 'direct';
}
