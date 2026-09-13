import { z } from "zod";import {
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
} from "../domain";
export const planLevelSchema = z.enum(PLAN_LEVELS);
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export const runStatusSchema = z.enum(RUN_STATUSES);
export const runTriggerSchema = z.enum(RUN_TRIGGERS);
export const activityStatusSchema = z.enum(ACTIVITY_STATUSES);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export const apiProviderSchema = z.enum(API_PROVIDERS);
export const planStepStatusSchema = z.enum(PLAN_STEP_STATUSES);
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export const hookStatusSchema = z.enum(HOOK_STATUSES);