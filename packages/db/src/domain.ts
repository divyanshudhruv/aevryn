export const PLAN_LEVELS = ["free", "pro"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

export { RUN_STATUSES, type RunStatus } from "@aevryn/config";

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const STEP_TOOL_STATUSES = ["running", "completed", "failed"] as const;
export type StepToolStatus = (typeof STEP_TOOL_STATUSES)[number];

export const TOOL_CALL_LOG_STATUSES = [
	"running",
	"completed",
	"failed",
] as const;
export type ToolCallLogStatus = (typeof TOOL_CALL_LOG_STATUSES)[number];
export const TOOL_CALL_LOG_DIRECTIONS = ["client", "server"] as const;
export type ToolCallLogDirection = (typeof TOOL_CALL_LOG_DIRECTIONS)[number];
