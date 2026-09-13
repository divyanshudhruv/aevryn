import { relations } from "drizzle-orm";

import { approvalRequests } from "./approval-request";
import { chatMessages } from "./chat-message";
import { files } from "./file";
import { groups } from "./group";
import { notifications } from "./notification";
import { planSteps } from "./plan-step";
import { globalSettings } from "./global-settings";
import { threadSettings } from "./thread-settings";
import { callouts } from "./callout";
import { threadWorkflowBindings } from "./thread-workflow-binding";
import { runs } from "./run";
import { runActivities } from "./run-activity";
import { schedules } from "./schedule";
import { threads } from "./thread";
import { webhookHooks } from "./webhook-hook";
import { workspaceApiKeys } from "./workspace-api-key";
import { workspaces } from "./workspace";
import { workflows } from "./workflow";
import { userProfiles } from "./user-profile";

// ── workspaces ───────────────────────────────────────────────────────

export const workspaceRelations = relations(workspaces, ({ many }) => ({
	groups: many(groups),
	threads: many(threads),
	workflows: many(workflows),
	notifications: many(notifications),
	apiKeys: many(workspaceApiKeys),
	files: many(files),
	globalSettings: many(globalSettings),
	callouts: many(callouts),
	threadWorkflowBindings: many(threadWorkflowBindings),
}));

// ── groups ──────────────────────────────────────────────────────────

export const groupRelations = relations(groups, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [groups.workspaceId],
		references: [workspaces.id],
	}),
	threads: many(threads),
}));

// ── threads ─────────────────────────────────────────────────────────

export const threadRelations = relations(threads, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [threads.workspaceId],
		references: [workspaces.id],
	}),
	group: one(groups, {
		fields: [threads.groupId],
		references: [groups.id],
	}),
	workflows: many(workflows),
	bindings: many(threadWorkflowBindings),
	chatMessages: many(chatMessages),
	runs: many(runs),
	schedules: many(schedules),
	webhookHooks: many(webhookHooks),
	threadSettings: many(threadSettings),
}));

// ── workflows ───────────────────────────────────────────────────────

export const workflowRelations = relations(workflows, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [workflows.workspaceId],
		references: [workspaces.id],
	}),
	runs: many(runs),
	steps: many(planSteps),
}));

// ── chat_messages ───────────────────────────────────────────────────

export const chatMessageRelations = relations(chatMessages, ({ one }) => ({
	thread: one(threads, {
		fields: [chatMessages.threadId],
		references: [threads.id],
	}),
}));

// ── runs (self-ref `rerun_of` — relationName on BOTH sides) ─────────

export const runRelations = relations(runs, ({ one, many }) => ({
	thread: one(threads, {
		fields: [runs.threadId],
		references: [threads.id],
	}),
	workflow: one(workflows, {
		fields: [runs.workflowId],
		references: [workflows.id],
	}),
	rerunOf: one(runs, {
		fields: [runs.rerunOf],
		references: [runs.id],
		relationName: "rerunOf",
	}),
	reruns: many(runs, { relationName: "rerunOf" }),
	activities: many(runActivities),
	approvalRequests: many(approvalRequests),
	webhookHooks: many(webhookHooks),
}));

// ── run_activities (self-ref `parent_id` — relationName BOTH sides) ─

export const runActivityRelations = relations(runActivities, ({ one, many }) => ({
	run: one(runs, {
		fields: [runActivities.runId],
		references: [runs.id],
	}),
	parent: one(runActivities, {
		fields: [runActivities.parentId],
		references: [runActivities.id],
		relationName: "parent",
	}),
	children: many(runActivities, { relationName: "parent" }),
}));

// ── approval_requests ──────────────────────────────────────────────

export const approvalRequestRelations = relations(approvalRequests, ({ one }) => ({
	run: one(runs, {
		fields: [approvalRequests.runId],
		references: [runs.id],
	}),
	workflow: one(workflows, {
		fields: [approvalRequests.workflowId],
		references: [workflows.id],
	}),
	thread: one(threads, {
		fields: [approvalRequests.threadId],
		references: [threads.id],
	}),
}));

// ── notifications ──────────────────────────────────────────────────

export const notificationRelations = relations(notifications, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [notifications.workspaceId],
		references: [workspaces.id],
	}),
	thread: one(threads, {
		fields: [notifications.threadId],
		references: [threads.id],
	}),
}));

// ── workspace_api_keys ─────────────────────────────────────────────

export const workspaceApiKeyRelations = relations(workspaceApiKeys, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceApiKeys.workspaceId],
		references: [workspaces.id],
	}),
}));

// ── files ───────────────────────────────────────────────────────────

export const fileRelations = relations(files, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [files.workspaceId],
		references: [workspaces.id],
	}),
	thread: one(threads, {
		fields: [files.threadId],
		references: [threads.id],
	}),
}));

// ── thread_settings ──────────────────────────────────────────────────

export const threadSettingsRelations = relations(threadSettings, ({ one }) => ({
	thread: one(threads, {
		fields: [threadSettings.threadId],
		references: [threads.id],
	}),
}));

// ── thread_workflow_bindings ──────────────────────────────────────────

export const threadWorkflowBindingRelations = relations(threadWorkflowBindings, ({ one }) => ({
	thread: one(threads, {
		fields: [threadWorkflowBindings.threadId],
		references: [threads.id],
	}),
	workflow: one(workflows, {
		fields: [threadWorkflowBindings.workflowId],
		references: [workflows.id],
	}),
	workspace: one(workspaces, {
		fields: [threadWorkflowBindings.workspaceId],
		references: [workspaces.id],
	}),
}));

// ── global_settings ───────────────────────────────────────────────────

export const globalSettingsRelations = relations(globalSettings, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [globalSettings.workspaceId],
		references: [workspaces.id],
	}),
}));

// ── callouts ──────────────────────────────────────────────────────────

export const calloutRelations = relations(callouts, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [callouts.workspaceId],
		references: [workspaces.id],
	}),
	user: one(userProfiles, {
		fields: [callouts.userId],
		references: [userProfiles.userId],
	}),
}));


// ── schedules ───────────────────────────────────────────────────────

export const scheduleRelations = relations(schedules, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [schedules.workspaceId],
		references: [workspaces.id],
	}),
	thread: one(threads, {
		fields: [schedules.threadId],
		references: [threads.id],
	}),
	lastRun: one(runs, {
		fields: [schedules.lastRunId],
		references: [runs.id],
	}),
}));

// ── webhook_hooks ───────────────────────────────────────────────────

export const webhookHookRelations = relations(webhookHooks, ({ one }) => ({
	run: one(runs, {
		fields: [webhookHooks.runId],
		references: [runs.id],
	}),
	workspace: one(workspaces, {
		fields: [webhookHooks.workspaceId],
		references: [workspaces.id],
	}),
	thread: one(threads, {
		fields: [webhookHooks.threadId],
		references: [threads.id],
	}),
}));