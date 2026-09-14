export const PLAN_LEVELS = ["free", "pro"] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

// One small status vocabulary, shared by runs and workflows.

export const RUN_STATUSES = [
  "running",
  "awaiting_approval",
  //   "queued",
  "completed",
  "failed",
  "sleeping",
  "idle",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];
export const MESSAGE_STATUSES = [
  "queued",
  "streaming",
  "completed",
  "failed",
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

export const ACTIVITY_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_TYPES = ["tool", "thinking", "system"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "denied"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const API_PROVIDERS = ["groq", "anakin", "mem0"] as const;
export type ApiProvider = (typeof API_PROVIDERS)[number];

export const PLAN_STEP_STATUSES = [
  "pending",
  "active",
  "completed",
  "skipped",
] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export const NOTIFICATION_TYPES = ["run", "system"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const HOOK_STATUSES = ["active", "fired", "expired"] as const;
export type HookStatus = (typeof HOOK_STATUSES)[number];
