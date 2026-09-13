export const PLAN_LEVELS = ["free", "pro"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

export const GROUP_KINDS = ["custom", "system"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const RUN_STATUSES = [
	"running",
	"sleeping",
	"awaiting_approval",
	"failed",
	"completed",
	"idle",
	"planning",
	"stopped",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const WORKFLOW_STATUSES = RUN_STATUSES;
export type WorkflowStatus = RunStatus;
export function threadStatus(workflowStatus: WorkflowStatus | null): RunStatus {
	return workflowStatus ?? "idle";
}
export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];
export const MESSAGE_STATUSES = [
	"draft",
	"queued",
	"streaming",
	"completed",
	"failed",
	"interrupted",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const RUN_TRIGGERS = [
	"message",
	"schedule",
	"resume",
	"approval",
	"rerun",
] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const ACTIVITY_STATUSES = ["pending", "active", "complete", "failed"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_TYPES = [
	"tool",
	"thinking",
	"task",
	"subtask",
	"system",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "denied"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const API_PROVIDERS = [
	"groq",
	"anakin",
	"mem0",
	"image",
	"speech",
	"transcription",
	"video",
] as const;
export type ApiProvider = (typeof API_PROVIDERS)[number];

export const PLAN_STATUSES = ["draft", "proposed", "accepted", "declined"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STEP_STATUSES = [
	"pending",
	"active",
	"completed",
	"skipped",
] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export const NOTIFICATION_TYPES = [
	"system",
	"workflow",
	"run",
	"security",
	"webhook",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const HOOK_STATUSES = ["active", "fired", "expired"] as const;
export type HookStatus = (typeof HOOK_STATUSES)[number];