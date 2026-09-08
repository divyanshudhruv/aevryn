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
});
