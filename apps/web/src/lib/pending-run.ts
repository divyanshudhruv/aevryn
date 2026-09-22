const KEY = "aevryn:pending-run";

export const pendingRunFlag = {
	write(threadId: string): void {
		try {
			sessionStorage.setItem(KEY, threadId);
		} catch {}
	},
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
