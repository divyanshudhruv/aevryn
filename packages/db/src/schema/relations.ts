import { relations } from "drizzle-orm";

import { approvalRequests } from "./approval-request";
import { chatMessages } from "./chat-message";
import { files } from "./file";
import { groups } from "./group";
import { invites } from "./invite";
import { notifications } from "./notification";
import { plans } from "./plan";
import { planSteps } from "./plan-step";
import { runs } from "./run";
import { runActivities } from "./run-activity";
import { schedules } from "./schedule";
import { threads } from "./thread";
import { threadShares } from "./thread-share";
import { webhookHooks } from "./webhook-hook";
import { workspaceApiKeys } from "./workspace-api-key";
import { workspaceMembers } from "./workspace-member";
import { workspaces } from "./workspace";
import { workflows } from "./workflow";

// ── workspaces ──────────────────────────────────────────────────────

export const workspaceRelations = relations(workspaces, ({ many }) => ({
	groups: many(groups),
	members: many(workspaceMembers),
	threads: many(threads),
	workflows: many(workflows),
	notifications: many(notifications),
	apiKeys: many(workspaceApiKeys),
	files: many(files),
}));

// ── groups ──────────────────────────────────────────────────────────

export const groupRelations = relations(groups, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [groups.workspaceId],
		references: [workspaces.id],
	}),
	threads: many(threads),
}));

// ── workspace_members ───────────────────────────────────────────────

export const workspaceMemberRelations = relations(workspaceMembers, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceMembers.workspaceId],
		references: [workspaces.id],
	}),
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
	chatMessages: many(chatMessages),
	runs: many(runs),
	schedules: many(schedules),
	webhookHooks: many(webhookHooks),
	shares: many(threadShares),
	invites: many(invites),
}));

// ── workflows ───────────────────────────────────────────────────────

export const workflowRelations = relations(workflows, ({ one, many }) => ({
	workspace: one(workspaces, {
		fields: [workflows.workspaceId],
		references: [workspaces.id],
	}),
	thread: one(threads, {
		fields: [workflows.threadId],
		references: [threads.id],
	}),
	plan: one(plans, {
		fields: [workflows.id],
		references: [plans.workflowId],
	}),
	runs: many(runs),
}));

// ── plans ───────────────────────────────────────────────────────────

export const planRelations = relations(plans, ({ one, many }) => ({
	workflow: one(workflows, {
		fields: [plans.workflowId],
		references: [workflows.id],
	}),
	steps: many(planSteps),
}));

// ── plan_steps ──────────────────────────────────────────────────────

export const planStepRelations = relations(planSteps, ({ one }) => ({
	plan: one(plans, {
		fields: [planSteps.planId],
		references: [plans.id],
	}),
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

// ── invites ─────────────────────────────────────────────────────────

export const inviteRelations = relations(invites, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [invites.workspaceId],
		references: [workspaces.id],
	}),
	thread: one(threads, {
		fields: [invites.threadId],
		references: [threads.id],
	}),
}));

// ── thread_shares ──────────────────────────────────────────────────

export const threadShareRelations = relations(threadShares, ({ one }) => ({
	thread: one(threads, {
		fields: [threadShares.threadId],
		references: [threads.id],
	}),
	invite: one(invites, {
		fields: [threadShares.inviteId],
		references: [invites.id],
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