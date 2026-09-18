// In-memory sliding fixed-window rate limiter, keyed per route+user.
// Sufficient for single-instance Node deployments; move to a shared store
// (Redis/Upstash) if the app is ever scaled horizontally.

const buckets = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_THRESHOLD = 10_000;

function pruneExpired(now: number): void {
	if (buckets.size < CLEANUP_THRESHOLD) return;
	for (const [key, bucket] of buckets) {
		if (now >= bucket.resetAt) buckets.delete(key);
	}
}

/**
 * Returns a 429 Response when the key has exceeded `limit` requests inside
 * `windowMs`, or null when the request is allowed.
 */
export function enforceRateLimit(opts: {
	key: string;
	limit: number;
	windowMs: number;
}): Response | null {
	const now = Date.now();
	pruneExpired(now);

	const bucket = buckets.get(opts.key);
	if (!bucket || now >= bucket.resetAt) {
		buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
		return null;
	}
	if (bucket.count < opts.limit) {
		bucket.count++;
		return null;
	}

	const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
	return Response.json(
		{
			data: null,
			error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly.", details: null },
			meta: {},
		},
		{
			status: 429,
			headers: { "cache-control": "no-store", "retry-after": String(retryAfter) },
		},
	);
}