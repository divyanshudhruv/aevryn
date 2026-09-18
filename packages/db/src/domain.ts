export const PLAN_LEVELS = ["free", "pro"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

// Confirmed run/thread status vocabulary — unchanged by the rewrite.
// Single source lives in @aevryn/config (shared by db + ui without
// ui depending on the db package).
export { RUN_STATUSES, type RunStatus } from "@aevryn/config";

// Chat message roles.
export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// Per-tool-call status inside steps.toolCalls (jsonb, not a pgEnum).
export const STEP_TOOL_STATUSES = ["running", "completed", "failed"] as const;
export type StepToolStatus = (typeof STEP_TOOL_STATUSES)[number];

// Tool-call log entries (tool_call_logs).
export const TOOL_CALL_LOG_STATUSES = [
	"running",
	"completed",
	"failed",
] as const;
export type ToolCallLogStatus = (typeof TOOL_CALL_LOG_STATUSES)[number];
export const TOOL_CALL_LOG_DIRECTIONS = ["client", "server"] as const;
export type ToolCallLogDirection = (typeof TOOL_CALL_LOG_DIRECTIONS)[number];
