import { Cron } from "croner";

/**
 * Compute the next run time for a schedule. A cron expression is validated
 * eagerly (throws on an invalid expression before anything is persisted);
 * an interval is computed from the reference time.
 */
export function computeNextRun(
	cron: string | undefined,
	intervalSeconds: number | undefined,
	from = new Date(),
): Date {
	if (cron) {
		const parsed = new Cron(cron, {
			paused: true,
			startAt: from,
		});
		const next = parsed.nextRun();
		if (!next) {
			throw new Error(`Schedule has no future run time: ${cron}`);
		}
		return next;
	}
	if (intervalSeconds) {
		return new Date(from.getTime() + intervalSeconds * 1000);
	}
	throw new Error(
		"Schedule requires either a cron expression or intervalSeconds",
	);
}
