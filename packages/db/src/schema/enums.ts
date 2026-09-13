import { pgEnum } from "drizzle-orm/pg-core";
import {
	ACTIVITY_STATUSES,
	ACTIVITY_TYPES,
	API_PROVIDERS,
	APPROVAL_STATUSES,
	HOOK_STATUSES,
	MESSAGE_ROLES,
	MESSAGE_STATUSES,
	NOTIFICATION_TYPES,
	PLAN_LEVELS,
	PLAN_STEP_STATUSES,
	RUN_STATUSES,
	RUN_TRIGGERS,
} from "../domain";export const planLevelEnum = pgEnum("plan_level", PLAN_LEVELS);
export const messageRoleEnum = pgEnum("message_role", MESSAGE_ROLES);
export const messageStatusEnum = pgEnum("message_status", MESSAGE_STATUSES);
export const runStatusEnum = pgEnum("run_status", RUN_STATUSES);
export const runTriggerEnum = pgEnum("run_trigger", RUN_TRIGGERS);
export const activityStatusEnum = pgEnum("activity_status", ACTIVITY_STATUSES);
export const activityTypeEnum = pgEnum("activity_type", ACTIVITY_TYPES);
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUSES);export const apiProviderEnum = pgEnum("api_provider", API_PROVIDERS);
export const planStepStatusEnum = pgEnum("plan_step_status", PLAN_STEP_STATUSES);
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);
export const hookStatusEnum = pgEnum("hook_status", HOOK_STATUSES);
