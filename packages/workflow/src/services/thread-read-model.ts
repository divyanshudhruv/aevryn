import type {
	ApprovalRequest,
	ChatMessage,
	Db,
	PlanStep,
	Run,
	RunActivity,
	Schedule,
	Workflow,
} from "@aevryn/db";
import {
	approvalRequests,
	chatMessages,
	db,
	globalSettings,
	planSteps,
	runs,
	runActivities,
	schedules,
	threadSettings,
	threadWorkflowBindings,
	threads,
	workflows,
} from "@aevryn/db";
import { and, asc, desc, eq } from "drizzle-orm";

/**
 * Thread read model — THE one coherent read shape for the thread page.
 * The page fetches this projection and renders from it; it never
 * reconstructs state from scattered queries or re-derives run status.
 */

export interface ThreadReadModel {
	thread: {
		id: string;
		workspaceId: string;
		groupId: string | null;
		title: string;
		createdAt: Date;
		updatedAt: Date;
		lastMessageAt: Date | null;
	};
	settings: {
		threadId: string;
		settings: Record<string, unknown>;
	} | null;
	workspaceSettings: {
		workspaceId: string;
		settings: Record<string, unknown>;
	} | null;
	binding: {
		workflowId: string;
		boundAt: Date;
		workflow: {
			id: string;
			title: string;
			description: string | null;
			status: Workflow["status"];
		};
		planSteps: Array<Pick<PlanStep, "id" | "title" | "description" | "status" | "position">>;
	} | null;
	messages: Array<Pick<ChatMessage, "id" | "role" | "content" | "status" | "runId" | "createdAt">>;
	run: {
		id: string;
		status: Run["status"];
		createdAt: Date;
	} | null;
	activities: Array<Pick<RunActivity, "id" | "type" | "status" | "stepLabel" | "title" | "description" | "detail" | "createdAt">>;
	approvals: Array<Pick<ApprovalRequest, "id" | "runId" | "toolName" | "input" | "status" | "createdAt">>;
	queue: {
		busy: boolean;
		pendingCount: number;
		pendingItems: Array<{ id: string; text: string }>;
	};
	schedules: Array<Pick<Schedule, "id" | "cron" | "intervalSeconds" | "nextRunAt" | "enabled" | "config">>;
}

function parseSettings(raw: string | null | undefined): Record<string, unknown> {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function textOf(content: unknown): string {
	const parts = (content as Array<{ type?: string; text?: string }> | null) ?? [];
	return (
		parts
			.filter((p) => p.type === "text" && typeof p.text === "string")
			.map((p) => p.text)
			.join(" ") || ""
	);
}

export class ThreadReadModelService {
	constructor(private readonly client: Db = db) {}

	async get(input: { threadId: string; userId: string }): Promise<ThreadReadModel | null> {
		const thread = await this.client.query.threads.findFirst({
			where: eq(threads.id, input.threadId),
		});
		if (!thread || thread.userId !== input.userId) {
			return null;
		}

		// Settings (thread overrides + workspace defaults)
		const [threadSettingsRow, workspaceSettingsRow] = await Promise.all([
			this.client.query.threadSettings.findFirst({
				where: eq(threadSettings.threadId, input.threadId),
			}),
			this.client.query.globalSettings.findFirst({
				where: eq(globalSettings.workspaceId, thread.workspaceId),
			}),
		]);

		// Bound workflow + plan steps
		const bindingRows = await this.client.query.threadWorkflowBindings.findMany({
			where: eq(threadWorkflowBindings.threadId, input.threadId),
			limit: 1,
		});
		let binding: ThreadReadModel["binding"] = null;
		const bindingRow = bindingRows[0];
		if (bindingRow) {
			const workflow = await this.client.query.workflows.findFirst({
				where: eq(workflows.id, bindingRow.workflowId),
			});
			if (workflow) {
				const steps = await this.client.query.planSteps.findMany({
					where: eq(planSteps.workflowId, workflow.id),
					orderBy: [asc(planSteps.position)],
					columns: { id: true, title: true, description: true, status: true, position: true },
				});
				binding = {
					workflowId: workflow.id,
					boundAt: bindingRow.boundAt,
					workflow: {
						id: workflow.id,
						title: workflow.title,
						description: workflow.description,
						status: workflow.status,
					},
					planSteps: steps,
				};
			}
		}

		// Messages, latest run, its activities, pending approvals, queue, schedules
		const [messages, latestRun, queued] = await Promise.all([
			this.client.query.chatMessages.findMany({
				where: eq(chatMessages.threadId, input.threadId),
				orderBy: [asc(chatMessages.createdAt)],
				limit: 200,
				columns: { id: true, role: true, content: true, status: true, runId: true, createdAt: true },
			}),
			this.client.query.runs.findMany({
				where: eq(runs.threadId, input.threadId),
				orderBy: [desc(runs.createdAt)],
				limit: 1,
				columns: { id: true, status: true, createdAt: true },
			}),
			this.client.query.chatMessages.findMany({
				where: and(eq(chatMessages.threadId, input.threadId), eq(chatMessages.status, "queued")),
				orderBy: [asc(chatMessages.queueOrder)],
			}),
		]);

		const run = latestRun[0] ?? null;
		const activities = run
			? await this.client.query.runActivities.findMany({
					where: eq(runActivities.runId, run.id),
					orderBy: [asc(runActivities.createdAt)],
					limit: 200,
					columns: {
						id: true, type: true, status: true, stepLabel: true,
						title: true, description: true, detail: true, createdAt: true,
					},
				})
			: [];

		const approvals = run
			? await this.client.query.approvalRequests.findMany({
					where: and(
						eq(approvalRequests.runId, run.id),
						eq(approvalRequests.status, "pending"),
					),
					columns: { id: true, runId: true, toolName: true, input: true, status: true, createdAt: true },
				})
			: [];

		const scheduleRows = await this.client.query.schedules.findMany({
			where: eq(schedules.threadId, input.threadId),
			columns: {
				id: true, cron: true, intervalSeconds: true,
				nextRunAt: true, enabled: true, config: true,
			},
		});

		const busy =
			run !== null && (run.status === "running" || run.status === "awaiting_approval");

		return {
			thread: {
				id: thread.id,
				workspaceId: thread.workspaceId,
				groupId: thread.groupId,
				title: thread.title,
				createdAt: thread.createdAt,
				updatedAt: thread.updatedAt,
				lastMessageAt: thread.lastMessageAt,
			},
			settings: threadSettingsRow
				? {
						threadId: threadSettingsRow.threadId,
						settings: parseSettings(threadSettingsRow.settings),
					}
				: null,
			workspaceSettings: workspaceSettingsRow
				? {
						workspaceId: workspaceSettingsRow.workspaceId,
						settings: parseSettings(workspaceSettingsRow.settings),
					}
				: null,
			binding,
			messages,
			run,
			activities,
			approvals,
			queue: {
				busy,
				pendingCount: queued.length,
				pendingItems: queued.map((m) => ({ id: m.id, text: textOf(m.content) })),
			},
			schedules: scheduleRows,
		};
	}
}

export const threadReadModelService = new ThreadReadModelService();
