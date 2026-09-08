import {
	type AgentActivity,
	type AgentResult,
	createDefaultRegistry,
	runAgent,
} from "@aevryn/agent";
import { type ActivitySnapshot, WorkflowService } from "@aevryn/workflow";
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

function createActivityAccumulator() {
	const snapshot: ActivitySnapshot = {
		status: "running",
		currentActivity: "starting",
		steps: [],
		tools: [],
		updatedAt: new Date(),
	};
	let toolCounter = 0;
	return {
		apply(activity: AgentActivity): void {
			snapshot.updatedAt = new Date();
			switch (activity.type) {
				case "tool-start": {
					snapshot.tools.push({
						order: toolCounter++,
						step: snapshot.steps.length,
						tool: activity.tool,
						status: "running",
					});
					snapshot.currentActivity = `running ${activity.tool}`;
					break;
				}
				case "tool-end": {
					const entry = snapshot.tools.find(
						(t) => t.tool === activity.tool && t.status === "running",
					);
					if (entry) {
						entry.status = activity.status;
					}
					snapshot.currentActivity = undefined;
					break;
				}
				case "step-end": {
					snapshot.steps = snapshot.steps.filter(
						(s) => s.order !== activity.step,
					);
					snapshot.steps.push({
						order: activity.step,
						text: activity.text,
					});
					snapshot.steps.sort((a, b) => a.order - b.order);
					snapshot.currentActivity = "summarizing";
					break;
				}
			}
		},
		snapshot() {
			return {
				...snapshot,
				steps: [...snapshot.steps],
				tools: [...snapshot.tools],
			};
		},
	};
}

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
	const activity = createActivityAccumulator();
	return {
		workflowId: parsed.workflowId,
		executionId: parsed.executionId,
		status: "running",
		result: await runAgent({
			registry: createDefaultRegistry(),
			objective: parsed.objective,
			modelContextCapChars: parsed.modelContextCapChars,
			onActivity: async (next) => {
				activity.apply(next);
				await workflowService.updateActivitySnapshot(
					parsed.workflowId,
					activity.snapshot(),
				);
			},
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
	const activity = await workflowService.getActivitySnapshot(
		outcome.workflowId,
	);
	if (activity) {
		await workflowService.updateActivitySnapshot(outcome.workflowId, {
			...activity,
			status: "completed",
			currentActivity: undefined,
			updatedAt: new Date(),
		});
	}
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
			const activity = await workflowService.getActivitySnapshot(
				parsed.data.data.event.data.workflowId,
			);
			if (activity) {
				await workflowService.updateActivitySnapshot(
					parsed.data.data.event.data.workflowId,
					{
						...activity,
						status: "failed",
						currentActivity: undefined,
						updatedAt: new Date(),
					},
				);
			}
		},
	},
	async ({ event, step }) => {
		const outcome = await step.run("run-agent-and-persist", () =>
			executeWorkflowRun(event.data),
		);
		return outcome;
	},
);
