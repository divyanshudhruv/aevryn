import {
	type AgentResult,
	createDefaultRegistry,
	runAgent,
} from "@aevryn/agent";
import { WorkflowService } from "@aevryn/workflow";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { inngest } from "../client";
import {
	type ExecutionRunResult,
	executionRunEvent,
	executionRunEventSchema,
} from "../events";

const workflowService = new WorkflowService();

const failureEventSchema = z.object({
	data: z.object({
		event: z.object({
			data: executionRunEventSchema,
		}),
		error: z.object({ message: z.string().optional() }).optional(),
	}),
});

export async function runAgentStep(data: unknown): Promise<{
	workflowId: string;
	executionId: string;
	status: "running" | "skipped";
	result?: AgentResult;
}> {
	const parsed = executionRunEventSchema.parse(data);
	const execution = await workflowService.getExecution(parsed.executionId);
	if (!execution) {
		throw new NonRetriableError(`Execution not found: ${parsed.executionId}`);
	}
	if (execution.status === "completed" || execution.status === "failed") {
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
		};
	}
	return {
		workflowId: parsed.workflowId,
		executionId: parsed.executionId,
		status: "running",
		result: await runAgent({
			registry: createDefaultRegistry(),
			objective: parsed.objective,
			modelContextCapChars: parsed.modelContextCapChars,
		}),
	};
}

export async function persistAndCompleteStep(
	outcome: Awaited<ReturnType<typeof runAgentStep>>,
): Promise<ExecutionRunResult> {
	if (outcome.status === "skipped") {
		return {
			workflowId: outcome.workflowId,
			executionId: outcome.executionId,
			status: "skipped",
			summary: "",
			stepCount: 0,
			toolCount: 0,
		};
	}
	const execution = await workflowService.getExecution(outcome.executionId);
	if (
		execution &&
		(execution.status === "completed" || execution.status === "failed")
	) {
		return {
			workflowId: outcome.workflowId,
			executionId: outcome.executionId,
			status: "skipped",
			summary: "",
			stepCount: 0,
			toolCount: 0,
		};
	}
	const result = outcome.result;
	if (!result) {
		throw new NonRetriableError(
			`No agent result for execution: ${outcome.executionId}`,
		);
	}
	await workflowService.recordSteps({
		executionId: outcome.executionId,
		steps: result.steps,
	});
	await workflowService.completeExecution({
		executionId: outcome.executionId,
	});
	return {
		workflowId: outcome.workflowId,
		executionId: outcome.executionId,
		status: "completed",
		summary: result.text.slice(0, 500),
		stepCount: result.steps.length,
		toolCount: result.steps.reduce(
			(count, step) => count + step.toolCalls.length,
			0,
		),
	};
}

export async function executeWorkflowRun(
	data: unknown,
): Promise<ExecutionRunResult> {
	const outcome = await runAgentStep(data);
	return persistAndCompleteStep(outcome);
}

export const executionRun = inngest.createFunction(
	{
		id: "execution-run",
		retries: 2,
		triggers: [{ event: executionRunEvent }],
		onFailure: async ({ event, error }) => {
			const parsed = failureEventSchema.safeParse(event);
			if (!parsed.success) {
				return;
			}
			const { executionId } = parsed.data.data.event.data;
			const execution = await workflowService.getExecution(executionId);
			if (
				!execution ||
				execution.status === "completed" ||
				execution.status === "failed"
			) {
				return;
			}
			const reason = (
				parsed.data.data.error?.message ??
				error.message ??
				"execution failed unexpectedly"
			).slice(0, 500);
			await workflowService.failExecution({ executionId, reason });
		},
	},
	async ({ event, step }) => {
		const outcome = await step.run("run-agent-and-persist", () =>
			executeWorkflowRun(event.data),
		);
		return outcome;
	},
);
