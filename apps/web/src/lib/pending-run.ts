// Cross-component handoff for "run this thread as soon as its page mounts".
// The sidebar's Run POSTs /run for validation, then dispatches a window
// event — but if the thread page is still NAVIGATING, the event fires before
// the page mounts its listener and the run trigger is lost. The intent
// therefore also lands in a sessionStorage flag that the thread page
// consumes once on mount. sessionStorage (not localStorage): the pending run
// is per-tab, dies with the tab, and never leaks across browser windows.
const KEY = "aevryn:pending-run";

export const pendingRunFlag = {
	write(threadId: string): void {
		try {
			sessionStorage.setItem(KEY, threadId);
		} catch {
			// Storage can throw in private modes / quota — the window event
			// path still works for already-open threads, so this is non-fatal.
		}
	},
	/** Consume the pending run for `threadId`: returns true exactly once and
	 *  clears the flag so a later remount can't double-fire the run. */
	consume(threadId: string): boolean {
		try {
			if (sessionStorage.getItem(KEY) !== threadId) return false;
			sessionStorage.removeItem(KEY);
			return true;
		} catch {
			return false;
		}
	},
};
