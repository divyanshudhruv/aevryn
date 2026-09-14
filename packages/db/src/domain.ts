export const PLAN_LEVELS = ["free", "pro"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

// Confirmed run/thread status vocabulary — unchanged by the rewrite.
export const RUN_STATUSES = [
	"running",
	"awaiting_approval",
	"completed",
	"failed",
	"sleeping",
	"idle",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// Chat message roles.
export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// Per-tool-call status inside steps.toolCalls (jsonb, not a pgEnum).
export const STEP_TOOL_STATUSES = ["running", "completed", "failed"] as const;
export type StepToolStatus = (typeof STEP_TOOL_STATUSES)[number];
