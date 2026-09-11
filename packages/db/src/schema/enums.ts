import { pgEnum } from "drizzle-orm/pg-core";

import {
	ACTIVITY_STATUSES,
	ACTIVITY_TYPES,
	API_PROVIDERS,
	APPROVAL_STATUSES,
	GROUP_KINDS,
	INVITE_KINDS,
	INVITE_STATUSES,
	MESSAGE_ROLES,
	MESSAGE_STATUSES,
	NOTIFICATION_TYPES,
	PLAN_LEVELS,
	PLAN_STATUSES,
	PLAN_STEP_STATUSES,
	ROLES,
	RUN_STATUSES,
	RUN_TRIGGERS,
	THREAD_ROLES,
	WORKFLOW_STATUSES,
} from "../domain";

export const roleEnum = pgEnum("role", ROLES);
export const threadRoleEnum = pgEnum("thread_role", THREAD_ROLES);
export const planLevelEnum = pgEnum("plan_level", PLAN_LEVELS);
export const groupKindEnum = pgEnum("group_kind", GROUP_KINDS);
export const inviteKindEnum = pgEnum("invite_kind", INVITE_KINDS);
export const inviteStatusEnum = pgEnum("invite_status", INVITE_STATUSES);
export const workflowStatusEnum = pgEnum("workflow_status", WORKFLOW_STATUSES);
export const messageRoleEnum = pgEnum("message_role", MESSAGE_ROLES);
export const messageStatusEnum = pgEnum("message_status", MESSAGE_STATUSES);
export const runStatusEnum = pgEnum("run_status", RUN_STATUSES);
export const runTriggerEnum = pgEnum("run_trigger", RUN_TRIGGERS);
export const activityStatusEnum = pgEnum("activity_status", ACTIVITY_STATUSES);
export const activityTypeEnum = pgEnum("activity_type", ACTIVITY_TYPES);
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUSES);
export const apiProviderEnum = pgEnum("api_provider", API_PROVIDERS);
export const planStatusEnum = pgEnum("plan_status", PLAN_STATUSES);
export const planStepStatusEnum = pgEnum("plan_step_status", PLAN_STEP_STATUSES);
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);