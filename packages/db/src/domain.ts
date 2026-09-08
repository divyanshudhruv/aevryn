export const WORKFLOW_STATUSES = [
	"draft",
	"active",
	"paused",
	"sleeping",
	"completed",
	"cancelled",
	"failed",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const EXECUTION_STATUSES = [
	"pending",
	"running",
	"sleeping",
	"completed",
	"failed",
	"cancelled",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const STEP_STATUSES = [
	"pending",
	"running",
	"completed",
	"failed",
	"skipped",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const TOOL_STATUSES = ["called", "completed", "failed"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

/** Structural classification of an external failure. */
export const FAILURE_CLASSES = ["transient", "structural", "fatal"] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const MEMORY_CATEGORIES = [
	"working",
	"episodic",
	"semantic",
	"procedural",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const RECOVERY_STATUSES = ["started", "completed", "failed"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];
