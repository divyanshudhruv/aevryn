// Server-enforced per-user caps; the DB triggers, the services, and the UI
// all mirror these. Single source of truth lives here.
export const WORKSPACE_LIMIT = 3;
export const GROUP_LIMIT = 10;
export const THREADS_PER_GROUP_LIMIT = 15;

export const RUN_STATUSES = [
	"running",
	"retrying",
	"awaiting_approval",
	"completed",
	"failed",
	"sleeping",
	"idle",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
