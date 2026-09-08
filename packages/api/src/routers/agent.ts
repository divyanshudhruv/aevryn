import { env } from "@aevryn/env/server";
import { executionRunEvent, inngest } from "@aevryn/inngest";
import { WorkflowService } from "@aevryn/workflow";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const runObjectiveSchema = z.object({
	objective: z.string().min(1).max(2000),
	modelContextCapChars: z.number().int().positive().max(2_000_000).optional(),
});

const workflowService = new WorkflowService();

export const agentRouter = router({
	runObjective: protectedProcedure
		.input(runObjectiveSchema)
		.mutation(async ({ input, ctx }) => {
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

			const userId = ctx.session.user.id;
			const { workflow } = await workflowService.createWorkflow({
				userId,
				objective: input.objective,
			});

			const started = await workflowService.startExecution({
				workflowId: workflow.id,
			});
			const executionId = started.execution.id;

			try {
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: workflow.id,
						executionId,
						objective: input.objective,
						modelContextCapChars: input.modelContextCapChars,
					},
				});
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				await workflowService.failExecution({
					executionId,
					reason: message,
				});
				throw error;
			}

			return {
				workflowId: workflow.id,
				executionId,
				status: "queued" as const,
			};
		}),
	getRun: protectedProcedure
		.input(z.object({ executionId: z.string().min(1) }))
		.query(async ({ input, ctx }) => {
			const timeline = await workflowService.getExecutionTimeline(
				input.executionId,
			);
			if (timeline.workflow.userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Execution does not belong to the current user",
				});
			}
			return {
				workflow: {
					id: timeline.workflow.id,
					objective: timeline.workflow.objective,
				},
				execution: {
					id: timeline.execution.id,
					status: timeline.execution.status,
					reason: timeline.execution.reason,
					startedAt: timeline.execution.startedAt,
					completedAt: timeline.execution.completedAt,
				},
				steps: timeline.steps.map((step) => ({
					id: step.id,
					order: step.order,
					kind: step.kind,
					text: step.assistantText,
					status: step.status,
					createdAt: step.createdAt,
				})),
				toolExecutions: timeline.toolExecutions.map((tool) => ({
					id: tool.id,
					stepId: tool.stepId,
					tool: tool.tool,
					status: tool.status,
					durationMs: tool.durationMs,
					errorCode: tool.errorCode,
					input: tool.input,
					output: tool.output,
				})),
				activity: timeline.activity,
			};
		}),
	listRuns: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(50).optional() }))
		.query(async ({ input, ctx }) => {
			const runs = await workflowService.listRuns(
				ctx.session.user.id,
				input.limit ?? 20,
			);
			return runs.map(({ workflow, execution }) => ({
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
			}));
		}),
});
