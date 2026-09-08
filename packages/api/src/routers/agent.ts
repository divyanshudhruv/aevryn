import { createDefaultRegistry, runAgent } from "@aevryn/agent";
import { env } from "@aevryn/env/server";
import { WorkflowService } from "@aevryn/workflow";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const runObjectiveSchema = z.object({
	objective: z.string().min(1).max(2000),
});

const workflowService = new WorkflowService();

export function persistAgentRun(
	executionId: string,
	result: Awaited<ReturnType<typeof runAgent>>,
) {
	return workflowService.recordSteps({
		executionId,
		steps: result.steps,
	});
}

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

			let executionId: string | undefined;
			try {
				const started = await workflowService.startExecution({
					workflowId: workflow.id,
				});
				executionId = started.execution.id;
				const result = await runAgent({
					registry: createDefaultRegistry(),
					objective: input.objective,
				});
				await persistAgentRun(executionId, result);
				await workflowService.completeExecution({ executionId });
				return {
					workflowId: workflow.id,
					executionId,
					text: result.text,
					toolsCalled: result.toolsCalled,
					pendingApprovals: result.pendingApprovals,
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (executionId) {
					await workflowService.failExecution({
						executionId,
						reason: message,
					});
				}
				throw error;
			}
		}),
});
