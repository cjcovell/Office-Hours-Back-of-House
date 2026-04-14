// =============================================================================
// Simple in-memory sliding-window rate limiter.
// Sufficient for single-instance or low-traffic serverless deployments.
// Swap to Redis/KV if distributed rate limiting is needed later.
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}

/**
 * Check if a request should be rate-limited.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
 */
export function rateLimit(
  userId: string,
  endpoint: string,
  { maxRequests = 10, windowMs = 60_000 } = {}
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  cleanup();

  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count < maxRequests) {
    entry.count++;
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}
