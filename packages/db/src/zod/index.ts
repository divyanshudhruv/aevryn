import { z } from "zod";

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
	RUN_STATUSES,
	RUN_TRIGGERS,
	THREAD_ROLES,
	WORKFLOW_STATUSES,
} from "../domain";

export const roleSchema = z.enum(["owner", "editor", "viewer"]);
export const threadRoleSchema = z.enum(THREAD_ROLES);
export const planLevelSchema = z.enum(PLAN_LEVELS);
export const groupKindSchema = z.enum(GROUP_KINDS);
export const inviteKindSchema = z.enum(INVITE_KINDS);
export const inviteStatusSchema = z.enum(INVITE_STATUSES);
export const workflowStatusSchema = z.enum(WORKFLOW_STATUSES);
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export const runStatusSchema = z.enum(RUN_STATUSES);
export const runTriggerSchema = z.enum(RUN_TRIGGERS);
export const activityStatusSchema = z.enum(ACTIVITY_STATUSES);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export const apiProviderSchema = z.enum(API_PROVIDERS);
export const planStatusSchema = z.enum(PLAN_STATUSES);
export const planStepStatusSchema = z.enum(PLAN_STEP_STATUSES);
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);