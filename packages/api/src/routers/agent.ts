import { env } from "@aevryn/env/server";
import { executionRunEvent, inngest } from "@aevryn/inngest";
import {
	Mem0MemoryStore,
	type Plan,
	resolveApprovalSchema,
	WorkflowService,
} from "@aevryn/workflow";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const sendMessageSchema = z.object({
	message: z.string().min(1).max(2000),
	workflowId: z.string().min(1).optional(),
	modelContextCapChars: z.number().int().positive().max(2_000_000).optional(),
});

const workflowIdSchema = z.object({ workflowId: z.string().min(1) });

const intakeAnswerSchema = z.object({
	selectedIds: z.array(z.string().min(1)).optional(),
	otherText: z.string().max(4000).optional(),
	skipped: z.boolean().optional(),
});

const answerIntakeSchema = workflowIdSchema.extend({
	answers: z.record(z.string().min(1).max(80), intakeAnswerSchema),
});

const updateObjectiveSchema = z.object({
	workflowId: z.string().min(1),
	objective: z.string().min(1).max(2000),
});

const scheduleActionSchema = z.object({
	workflowId: z.string().min(1),
	scheduleId: z.string().min(1),
});

const scheduleToggleSchema = scheduleActionSchema.extend({
	enabled: z.boolean(),
});

const markReadSchema = z.object({
	notificationIds: z.array(z.string().min(1)).max(50).optional(),
});

const memoryIdsSchema = z.object({
	ids: z.array(z.string().min(1)).max(100),
});

const workflowService = new WorkflowService();
const memoryStore = new Mem0MemoryStore(env.MEM0_API_KEY);

async function requireEnv() {
	if (!env.GROQ_API_KEY) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "GROQ_API_KEY is not configured",
		});
	}
	if (!env.ANAKIN_API_KEY) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "ANAKIN_API_KEY is not configured",
		});
	}
}

async function requireOwnedWorkflow(workflowId: string, userId: string) {
	const workflow = await workflowService.getWorkflowById(workflowId);
	if (!workflow || workflow.userId !== userId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Workflow does not belong to the current user",
		});
	}
	return workflow;
}

/** Renders the user's intake answers as a compact block the planner can fold
 *  into the finalized plan. Option ids follow the UI convention minted by
 *  `intakeToQuestions` — `<questionId>-o-<index>`. */
function formatIntakeAnswers(
	plan: Plan,
	answers: z.infer<typeof answerIntakeSchema>["answers"],
): string {
	const lines: string[] = [];
	for (const q of plan.intake ?? []) {
		const answer = answers[q.id];
		if (!answer || answer.skipped) {
			lines.push(`- ${q.title}: skipped`);
			continue;
		}
		if (q.freeText) {
			lines.push(`- ${q.title}: ${answer.otherText ?? ""}`);
			continue;
		}
		const chosen = (answer.selectedIds ?? [])
			.map((id) => q.options.find((_, oi) => `${q.id}-o-${oi}` === id))
			.filter((option): option is (typeof q.options)[number] => option !== undefined)
			.map((option) => option.title);
		const extra = answer.otherText?.trim() ? ` (${answer.otherText.trim()})` : "";
		lines.push(`- ${q.title}: ${chosen.join(", ")}${extra}`);
	}
	return lines.join("\n");
}

export const agentRouter = router({
	sendMessage: protectedProcedure
		.input(sendMessageSchema)
		.mutation(async ({ input, ctx }) => {
			await requireEnv();

			const userId = ctx.session.user.id;

			let workflowId: string;
			if (input.workflowId) {
				const workflow = await requireOwnedWorkflow(input.workflowId, userId);
				workflowId = workflow.id;
			} else {
				const created = await workflowService.createWorkflow({
					userId,
					objective: input.message,
				});
				workflowId = created.workflow.id;
			}

			const started = await workflowService.enqueueMessage(
				workflowId,
				input.message,
			);
			const executionId = started.execution.id;

			// Fire the queue enqueue without blocking the response: the thread
			// must be created and navigated to even if the inngest worker is not
			// running yet. A failed hand-off just marks the run failed; the user
			// can re-run from the header once the worker is up.
			try {
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId,
						executionId,
						prompt: input.message,
						modelContextCapChars: input.modelContextCapChars,
					},
				});
			} catch {
				await workflowService.failExecution({
					executionId,
					reason: "Run could not be queued (inngest worker not reachable)",
				});
			}

			return {
				workflowId,
				executionId,
				status: "queued" as const,
			};
		}),
	/**
	 * Answer-to-plan round: the user answered the planner's intake questions.
	 * A fresh planning-mode run is queued with those answers as context, so the
	 * planner finalizes the plan. The workflow stays in `draft` (planning mode)
	 * for this run; if the plan still carries `intake`, the UI asks again
	 * (iterative clarification), otherwise the plan is ready to run.
	 */
	answerIntake: protectedProcedure
		.input(answerIntakeSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			const plan = await workflowService.getPlan(input.workflowId);
			if (!plan || !plan.intake?.length) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workflow has no open planning questions",
				});
			}
			const answersBlock = formatIntakeAnswers(plan, input.answers);
			const prompt = `${plan.objective}\n\nThe user has answered your planning questions. Finalize the plan with these answers and emit the finished plan JSON. Use another intake only if something is still genuinely blocking a concrete plan:\n${answersBlock}`;
			const started = await workflowService.enqueueMessage(
				input.workflowId,
				prompt,
			);
			try {
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: input.workflowId,
						executionId: started.execution.id,
						prompt,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				await workflowService.failExecution({
					executionId: started.execution.id,
					reason: message.slice(0, 500),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Answers saved but the refine run could not be queued",
				});
			}
			return {
				workflowId: input.workflowId,
				executionId: started.execution.id,
				status: "queued" as const,
			};
		}),
	confirmWorkflow: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			try {
				await workflowService.bindWorkflow(input.workflowId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Workflow could not be bound",
				});
			}
			const plan = await workflowService.getPlan(input.workflowId);
			const workflow = await workflowService.getWorkflowById(input.workflowId);
			const objective = plan?.objective ?? workflow?.objective;
			if (!objective) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Bound workflow has no objective to run",
				});
			}
			const started = await workflowService.enqueueMessage(
				input.workflowId,
				objective,
			);
			try {
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: input.workflowId,
						executionId: started.execution.id,
						prompt: objective,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				await workflowService.failExecution({
					executionId: started.execution.id,
					reason: message.slice(0, 500),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Workflow bound but its first run could not be queued",
				});
			}
			return { bound: true as const, executionId: started.execution.id };
		}),
	discardPlan: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			await workflowService.discardPlan(input.workflowId);
			return { discarded: true as const };
		}),
	updateObjective: protectedProcedure
		.input(updateObjectiveSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			await workflowService.updateObjective(input.workflowId, input.objective);
			const started = await workflowService.enqueueMessage(
				input.workflowId,
				input.objective,
			);
			try {
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: input.workflowId,
						executionId: started.execution.id,
						prompt: input.objective,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				await workflowService.failExecution({
					executionId: started.execution.id,
					reason: message.slice(0, 500),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Objective saved but its planning run could not be queued",
				});
			}
			return {
				workflowId: input.workflowId,
				executionId: started.execution.id,
				status: "queued" as const,
			};
		}),
	getThread: protectedProcedure
		.input(workflowIdSchema)
		.query(async ({ input, ctx }) => {
			const thread = await workflowService.getThread(input.workflowId);
			if (thread.workflow.userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Workflow does not belong to the current user",
				});
			}
			let memorySummary: Array<{
				category: string;
				text: string;
				createdAt: string;
			}> | null = null;
			try {
				const entries = await memoryStore.listForUser({
					userId: ctx.session.user.id,
					limit: 5,
				});
				memorySummary = entries.map((entry) => ({
					category: entry.category,
					text: entry.text,
					createdAt: entry.createdAt,
				}));
			} catch {
				memorySummary = null;
			}
			return {
				workflow: {
					id: thread.workflow.id,
					objective: thread.workflow.objective,
					customPrompt: thread.workflow.customPrompt ?? null,
					status: thread.workflow.status,
					createdAt: thread.workflow.createdAt,
				},
				plan: thread.plan,
				planProgress: thread.planProgress,
				approvals: thread.approvals.map((approval) => ({
					id: approval.id,
					executionId: approval.executionId,
					toolName: approval.toolName,
					status: approval.status,
					input: approval.input,
					reason: approval.reason,
					createdAt: approval.createdAt,
					decidedAt: approval.decidedAt,
				})),
				activity: thread.activity,
				schedules: thread.schedules.map((schedule) => ({
					id: schedule.id,
					cron: schedule.cron,
					intervalSeconds: schedule.intervalSeconds,
					enabled: schedule.enabled === 1,
					nextRunAt: schedule.nextRunAt,
					lastRunAt: schedule.lastRunAt,
				})),
				notifications: thread.notifications.map((notification) => ({
					id: notification.id,
					type: notification.type,
					channel: notification.channel,
					subject: notification.subject,
					body: notification.body,
					createdAt: notification.createdAt,
					deliveredAt: notification.deliveredAt,
					readAt: notification.readAt,
				})),
				observations: thread.observations.map((observation) => ({
					id: observation.id,
					type: observation.type,
					content: observation.content,
					observedAt: observation.observedAt,
				})),
				recoveryAttempts: thread.recoveryAttempts.map((attempt) => ({
					id: attempt.id,
					executionId: attempt.executionId,
					failureClass: attempt.failureClass,
					failureCode: attempt.failureCode,
					attempt: attempt.attempt,
					strategy: attempt.strategy,
					result: attempt.result,
					createdAt: attempt.createdAt,
				})),
				memorySummary,
				turns: thread.turns.map((turn) => ({
					execution: {
						id: turn.execution.id,
						status: turn.execution.status,
						reason: turn.execution.reason,
						startedAt: turn.execution.startedAt,
						completedAt: turn.execution.completedAt,
						costUsd: turn.execution.costUsd,
						tokenCount: turn.execution.tokenCount,
					},
					prompt: turn.execution.prompt,
					steps: [...turn.steps]
						.sort((a, b) => a.order - b.order)
						.map((step) => ({
							id: step.id,
							order: step.order,
							kind: step.kind,
							text: step.assistantText,
							status: step.status,
							createdAt: step.createdAt,
						})),
					toolExecutions: turn.toolExecutions.map((tool) => ({
						id: tool.id,
						order: tool.order,
						stepId: tool.stepId,
						tool: tool.tool,
						status: tool.status,
						durationMs: tool.durationMs,
						errorCode: tool.errorCode,
						input: tool.input,
						output: tool.output,
					})),
				})),
			};
		}),
	runWorkflow: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			const workflow = await workflowService.getWorkflowById(input.workflowId);
			if (!workflow) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workflow not found",
				});
			}
			if (workflow.status === "draft") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workflow is not bound — start it from the plan card first",
				});
			}
			if (!workflow.objective) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Bound workflow has no objective to run",
				});
			}
			const started = await workflowService.enqueueMessage(
				input.workflowId,
				workflow.objective,
			);
			try {
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: input.workflowId,
						executionId: started.execution.id,
						prompt: workflow.objective,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				await workflowService.failExecution({
					executionId: started.execution.id,
					reason: message.slice(0, 500),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Run could not be queued",
				});
			}
			return {
				workflowId: input.workflowId,
				executionId: started.execution.id,
				status: "queued" as const,
			};
		}),
	stopWorkflow: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			const { cancelled } = await workflowService.stopExecution(
				input.workflowId,
			);
			return { stopped: true as const, cancelled };
		}),
	toggleSchedule: protectedProcedure
		.input(scheduleToggleSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			const schedule = await workflowService.toggleSchedule(
				input.workflowId,
				input.scheduleId,
				input.enabled,
			);
			return { id: schedule.id, enabled: schedule.enabled === 1 };
		}),
	deleteSchedule: protectedProcedure
		.input(scheduleActionSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			await workflowService.deleteSchedule(input.scheduleId, input.workflowId);
			return { deleted: true as const, id: input.scheduleId };
		}),
	markNotificationsRead: protectedProcedure
		.input(markReadSchema)
		.mutation(async ({ input, ctx }) => {
			const result = await workflowService.markNotificationsRead(
				ctx.session.user.id,
				input.notificationIds,
			);
			return { marked: result.marked };
		}),
	unreadNotifications: protectedProcedure.query(async ({ ctx }) => {
		const count = await workflowService.countUnreadNotifications(
			ctx.session.user.id,
		);
		return { count };
	}),
	listThreadMemories: protectedProcedure
		.input(workflowIdSchema)
		.query(async ({ input, ctx }) => {
			try {
				const entries = await memoryStore.listForUser({
					userId: ctx.session.user.id,
					limit: 100,
				});
				return entries
					.filter(
						(entry) =>
							(entry.metadata as Record<string, unknown> | undefined)
								?.workflowId === input.workflowId,
					)
					.map((entry) => ({
						id: entry.id,
						text: entry.text,
						category: entry.category,
						score: entry.score ?? null,
						createdAt: entry.createdAt,
					}));
			} catch {
				return [];
			}
		}),
	listRuns: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(50).optional() }))
		.query(async ({ input, ctx }) => {
			const runs = await workflowService.listRuns(
				ctx.session.user.id,
				input.limit ?? 20,
			);
			return runs.map(({ workflow, execution, messageCount }) => ({
				workflow: {
					id: workflow.id,
					objective: workflow.objective,
					status: workflow.status,
					createdAt: workflow.createdAt,
				},
				execution: execution
					? {
							id: execution.id,
							status: execution.status,
							reason: execution.reason,
							startedAt: execution.startedAt,
							completedAt: execution.completedAt,
						}
					: null,
				messageCount,
			}));
		}),
	listNotifications: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(50).optional() }))
		.query(async ({ input, ctx }) => {
			const notifications = await workflowService.listNotificationsForUser(
				ctx.session.user.id,
				input.limit ?? 20,
			);
			return notifications.map((notification) => ({
				id: notification.id,
				workflowId: notification.workflowId,
				type: notification.type,
				channel: notification.channel,
				subject: notification.subject,
				body: notification.body,
				createdAt: notification.createdAt,
				deliveredAt: notification.deliveredAt,
				readAt: notification.readAt,
			}));
		}),
	resolveApproval: protectedProcedure
		.input(resolveApprovalSchema)
		.mutation(async ({ input, ctx }) => {
			const userId = ctx.session.user.id;
			const resolved = await workflowService.resolveApproval(input, userId);
			if (resolved.remainingPending > 0) {
				return {
					approvalId: input.approvalId,
					resolution: resolved.resolution,
					remainingPending: resolved.remainingPending,
					executionId: resolved.execution?.id ?? null,
					resumedAt: null,
				};
			}
			const execution = resolved.execution;
			if (!execution) {
				return {
					approvalId: input.approvalId,
					resolution: resolved.resolution,
					remainingPending: 0,
					executionId: null,
					resumedAt: null,
				};
			}
			if (resolved.resolution === "approved") {
				const approvedToolNames = resolved.onlyApproved.map((a) => a.toolName);
				const started = await workflowService.enqueueMessage(
					resolved.workflow.id,
					resolved.workflow.objective,
				);
				try {
					await inngest.send({
						name: executionRunEvent,
						data: {
							workflowId: resolved.workflow.id,
							executionId: started.execution.id,
							prompt: resolved.workflow.objective,
							approvedToolNames,
						},
					});
					await workflowService.completeSupersededExecution(execution.id);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Unknown error";
					await workflowService.failExecution({
						executionId: started.execution.id,
						reason: message.slice(0, 500),
					});
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Approved but the resume run could not be queued",
					});
				}
				return {
					approvalId: input.approvalId,
					resolution: resolved.resolution,
					remainingPending: 0,
					executionId: started.execution.id,
					resumedAt: started.execution.startedAt,
				};
			}
			await workflowService.failExecution({
				executionId: execution.id,
				reason: input.reason ?? "Approval denied",
			});
			await workflowService.createNotification({
				userId: resolved.workflow.userId,
				workflowId: resolved.workflow.id,
				channel: "in-app",
				type: "workflow.failed",
				subject: "Workflow stopped — action was denied",
				body: {
					toolName: execution.reason,
					reason: input.reason ?? null,
				},
			});
			return {
				approvalId: input.approvalId,
				resolution: resolved.resolution,
				remainingPending: 0,
				executionId: execution.id,
				resumedAt: null,
			};
		}),
	listApprovals: protectedProcedure
		.input(
			z.object({
				workflowId: z.string().min(1),
				limit: z.number().int().min(1).max(100).optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const workflow = await requireOwnedWorkflow(
				input.workflowId,
				ctx.session.user.id,
			);
			const approvals = await workflowService.listApprovalsByWorkflow(
				workflow.id,
				input.limit ?? 50,
			);
			return approvals.map((approval) => ({
				id: approval.id,
				executionId: approval.executionId,
				toolName: approval.toolName,
				status: approval.status,
				input: approval.input,
				reason: approval.reason,
				createdAt: approval.createdAt,
				decidedAt: approval.decidedAt,
			}));
		}),
	pauseWorkflow: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			const { cancelled } = await workflowService.pauseWorkflow(
				input.workflowId,
			);
			return { paused: true as const, cancelled };
		}),
resumeWorkflow: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			await workflowService.resumeWorkflow(input.workflowId);
			return { resumed: true as const };
		}),
	deleteWorkflow: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			await workflowService.deleteWorkflow(input.workflowId);
			return { deleted: true as const };
		}),
	updateWorkflowSettings: protectedProcedure
		.input(
			z.object({
				workflowId: z.string().min(1),
				objective: z.string().trim().min(1).max(1000).optional(),
				customPrompt: z.string().trim().max(4000).nullable().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await requireOwnedWorkflow(input.workflowId, ctx.session.user.id);
			if (input.objective !== undefined) {
				await workflowService.setWorkflowObjective(
					input.workflowId,
					input.objective,
				);
			}
			if (input.customPrompt !== undefined) {
				await workflowService.setWorkflowCustomPrompt(
					input.workflowId,
					input.customPrompt,
				);
			}
			return { updated: true as const };
		}),
	listMemories: protectedProcedure.query(async ({ ctx }) => {
		try {
			const entries = await memoryStore.listForUser({
				userId: ctx.session.user.id,
				limit: 100,
			});
			return entries.map((entry) => ({
				id: entry.id,
				text: entry.text,
				category: entry.category,
				score: entry.score ?? null,
				createdAt: entry.createdAt,
			}));
		} catch {
			return [];
		}
	}),
	deleteMemories: protectedProcedure
		.input(memoryIdsSchema)
		.mutation(async ({ input, ctx }) => {
			await memoryStore.deleteByIds(ctx.session.user.id, input.ids);
			return { deleted: input.ids.length };
		}),
	deleteAllMemories: protectedProcedure.mutation(async ({ ctx }) => {
		await memoryStore.deleteAllForUser(ctx.session.user.id);
		return { deleted: true as const };
	}),
});
