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