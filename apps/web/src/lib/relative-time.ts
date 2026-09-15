const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(date: Date | string | null | undefined): string | undefined {
	if (!date) return undefined;
	const d = typeof date === "string" ? new Date(date) : date;
	const ms = d.getTime();
	if (!Number.isFinite(ms)) return undefined;

	const diff = Date.now() - ms;
	if (diff < 0) return "just now";
	if (diff < MINUTE) return "just now";
	if (diff < HOUR) {
		const minutes = Math.floor(diff / MINUTE);
		return `${minutes}m ago`;
	}
	if (diff < DAY) {
		const hours = Math.floor(diff / HOUR);
		return `${hours}h ago`;
	}
	if (diff < 7 * DAY) {
		const days = Math.floor(diff / DAY);
		return `${days}d ago`;
	}
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
