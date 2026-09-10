import { useEffect, useRef } from "react";

/**
 * Polls `fn` every `intervalMs` while `enabled` is true. Stops immediately on
 * disable or unmount. Used to keep workflow state fresh while a run is live.
 */
export function usePolling(
	fn: () => void | Promise<void>,
	enabled: boolean,
	intervalMs = 3000,
) {
	const fnRef = useRef(fn);
	fnRef.current = fn;

	useEffect(() => {
		if (!enabled) return;
		const id = setInterval(() => {
			void fnRef.current();
		}, intervalMs);
		return () => clearInterval(id);
	}, [enabled, intervalMs]);
}