import {
	type AgentActivity,
	type AgentResult,
	createDefaultRegistry,
	createPlanningRegistry,
	PLANNING_SYSTEM_INSTRUCTIONS,
	runAgent,
	withExecutionCapabilities,
} from "@aevryn/agent";
import { env } from "@aevryn/env/server";
import {
	type ActivitySnapshot,
	classifyFailure,
	type Decision,
	decisionSchema,
	Mem0MemoryStore,
	type Plan,
	planSchema,
	WorkflowService,
} from "@aevryn/workflow";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { inngest } from "../client";
import {
	type ExecutionRunResult,
	executionRunEvent,
	executionRunEventSchema,
} from "../events";

const workflowService = new WorkflowService();
const memoryStore = new Mem0MemoryStore(env.MEM0_API_KEY);

const failureEventSchema = z.object({
	data: z.object({
		event: z.object({
			data: executionRunEventSchema,
		}),
		error: z
			.object({
				message: z.string().optional(),
				code: z.string().optional(),
			})
			.optional(),
	}),
});

function extractPlan(text: string): Plan | null {
	const match = text.match(/```json\s*([\s\S]*?)```/);
	if (!match?.[1]) {
		return null;
	}
	try {
		return planSchema.parse(JSON.parse(match[1]));
	} catch {
		return null;
	}
}

function extractDecision(text: string): Decision | null {
	const match = text.match(/```json\s*([\s\S]*?)```/);
	if (!match?.[1]) {
		return null;
	}
	try {
		return decisionSchema.parse(JSON.parse(match[1]));
	} catch {
		return null;
	}
}

const RUN_DECISION_INSTRUCTIONS = `You may end your reply with a fenced JSON decision block to control the workflow runtime. Use it ONLY when needed:
- {"action":"sleep","sleepUntil":"<ISO-8601>","reason":"..."} to pause this run and wake it up at that moment (e.g. check again later), then continue on wake.
- {"action":"notify","notification":{"type":"alert","subject":"...","body":{...}},"reason":"..."} to send the user an in-app notification and finish.
- {"action":"stop","reason":"..."} to cancel this run.
- {"action":"wait","waitFor":{"description":"<what external event this run waits for>","expiresInSeconds":<optional, 60..2592000>},"notification":{"type":"webhook","subject":"...","body":{...}}} to pause this run on a durable webhook. The user is told the webhook URL; when they POST to it, this run resumes with the payload handed back as instruction context.
If no block is needed (the normal case, e.g. objective finished), emit none and the run is marked complete. Keep your visible answer plain text.`;

function recoveryBlock(context: {
	attempt: number;
	failureCode?: string;
	failureMessage?: string;
}): string {
	return `This run is a bounded recovery attempt (attempt ${context.attempt}) after a previous failure: ${context.failureMessage ?? context.failureCode ?? "unknown error"}.
Treat any retrieval from procedural memory as the proven way forward and reuse it. Otherwise diagnose, adjust your approach, and continue the original objective. Do not start new consequential side effects speculatively.`;
}

async function buildConversationInstructions(
	workflowId: string,
	executionId: string,
	maxChars: number | undefined,
	mode: "planning" | "run",
	recoveryContext?: {
		attempt: number;
		failureCode?: string;
		failureMessage?: string;
	},
): Promise<string | undefined> {
	const context = await workflowService.getConversationContext(
		workflowId,
		executionId,
		maxChars,
	);
	if (mode === "planning") {
		const base = PLANNING_SYSTEM_INSTRUCTIONS;
		return context ? `${base}\n\n${context}` : base;
	}
	let base = RUN_DECISION_INSTRUCTIONS;
	if (recoveryContext) {
		base = `${base}\n\n${recoveryBlock(recoveryContext)}`;
	}
	const memory = await retrieveRelevantMemory(
		workflowId,
		recoveryContext !== undefined,
	);
	if (memory) {
		base = `${base}\n\n${memory}`;
	}
	return context ? `${base}\n\n${context}` : base;
}

async function retrieveRelevantMemory(
	workflowId: string,
	preferProcedural = false,
): Promise<string | null> {
	try {
		const workflow = await workflowService.getWorkflowById(workflowId);
		if (!workflow) {
			return null;
		}
		const entries = await memoryStore.search({
			userId: workflow.userId,
			query: workflow.objective,
			limit: 3,
			...(preferProcedural ? { categories: ["procedural"] } : {}),
		});
		if (entries.length === 0) {
			return null;
		}
		const lines = entries.map((entry) => `- [${entry.category}] ${entry.text}`);
		return `Retrieved from long-term memory (use if relevant, ignore if stale):\n${lines.join("\n")}`;
	} catch {
		return null;
	}
}

async function storeEpisodicMemory(
	workflowId: string,
	executionId: string,
	summary: string,
): Promise<void> {
	try {
		const workflow = await workflowService.getWorkflowById(workflowId);
		if (!workflow) {
			return;
		}
		await memoryStore.store({
			userId: workflow.userId,
			workflowId,
			executionId,
			category: "episodic",
			text: `Completed run of "${workflow.objective}". Result: ${summary}`.slice(
				0,
				4000,
			),
			metadata: { workflowObjective: workflow.objective },
		});
	} catch {
		// Memory persistence must never fail a run.
	}
}

async function storeProceduralMemory(
	workflowId: string,
	executionId: string,
	context: { attempt: number; failureCode?: string; failureMessage?: string },
): Promise<void> {
	try {
		const workflow = await workflowService.getWorkflowById(workflowId);
		if (!workflow) {
			return;
		}
		await memoryStore.store({
			userId: workflow.userId,
			workflowId,
			executionId,
			category: "procedural",
			text: `Recovery (attempt ${context.attempt}) for "${workflow.objective}" succeeded after ${context.failureCode ?? "a failure"}: ${context.failureMessage ?? "unknown error"}. The resumed run completed successfully.`.slice(
				0,
				4000,
			),
			metadata: {
				failureCode: context.failureCode,
				workflowObjective: workflow.objective,
			},
		});
	} catch {
		// Memory persistence must never fail a run.
	}
}

async function notifyFailure(
	workflowId: string,
	failureClass: string,
	failureCode: string | undefined,
	reason: string,
): Promise<void> {
	const workflow = await workflowService.getWorkflowById(workflowId);
	if (workflow) {
		await workflowService.createNotification({
			userId: workflow.userId,
			workflowId,
			channel: "in-app",
			type: "workflow.failed",
			subject: "Workflow run failed",
			body: { failureClass, failureCode, reason },
		});
	}
	try {
		const activity = await workflowService.getActivitySnapshot(workflowId);
		if (activity) {
			await workflowService.updateActivitySnapshot(workflowId, {
				...activity,
				status: "failed",
				currentActivity: undefined,
				updatedAt: new Date(),
			});
		}
	} catch {
		// Activity snapshot is best-effort on the failure path.
	}
}

/**
 * Bounded recovery: classify the failure, record the attempt (idempotent per
 * (executionId, attempt)), and re-enqueue the same execution with a
 * recoveryContext the next run can see. Re-enqueues only when THIS call was
 * the one that recorded the attempt, so concurrent failure handlers cannot
 * double-schedule. Fatal failures or attempts past RECOVERY_MAX_ATTEMPTS fall
 * through to a durable fail.
 */
async function maybeScheduleRecovery(
	parsed: z.infer<typeof executionRunEventSchema>,
	failure: { code: string; reason: string },
): Promise<boolean> {
	const classification = classifyFailure({ code: failure.code });
	const attempts = await workflowService.countRecoveryAttempts(
		parsed.executionId,
	);
	const attempt = attempts + 1;
	if (
		classification.failureClass === "fatal" ||
		attempt > env.RECOVERY_MAX_ATTEMPTS
	) {
		await workflowService.recordRecoveryAttempt({
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			failureClass: classification.failureClass,
			failureCode: classification.failureCode,
			attempt,
			strategy: "fail-safe",
			result: "failed",
			detail: { reason: failure.reason },
		});
		await workflowService.failExecution({
			executionId: parsed.executionId,
			reason: failure.reason,
		});
		await notifyFailure(
			parsed.workflowId,
			classification.failureClass,
			classification.failureCode,
			failure.reason,
		);
		return false;
	}
	const recorded = await workflowService.recordRecoveryAttempt({
		workflowId: parsed.workflowId,
		executionId: parsed.executionId,
		failureClass: classification.failureClass,
		failureCode: classification.failureCode,
		attempt,
		strategy: "bounded-retry",
		result: "started",
		detail: { reason: failure.reason },
	});
	if (!recorded) {
		return true;
	}
	await inngest.send({
		name: executionRunEvent,
		data: {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			prompt: parsed.prompt,
			modelContextCapChars: parsed.modelContextCapChars,
			recoveryContext: {
				failureCode: classification.failureCode,
				failureMessage: failure.reason,
				attempt,
			},
		},
	});
	return true;
}

function createActivityAccumulator(workflowId: string, executionId: string) {
	const snapshot: ActivitySnapshot = {
		status: "running",
		currentActivity: "starting",
		executionId,
		steps: [],
		tools: [],
		updatedAt: new Date(),
	};
	let toolCounter = 0;
	const persistTool = (
		activity: Extract<
			AgentActivity,
			{ type: "tool-start" } | { type: "tool-end" }
		>,
		order: number,
	) =>
		workflowService.upsertToolActivity({
			workflowId,
			executionId,
			order,
			tool: activity.tool,
			status: activity.type === "tool-start" ? "called" : activity.status,
			input:
				activity.type === "tool-start"
					? (activity.input as Record<string, unknown> | undefined)
					: undefined,
		});
	return {
		apply(activity: AgentActivity): void {
			snapshot.updatedAt = new Date();
			switch (activity.type) {
				case "tool-start": {
					const order = toolCounter++;
					void persistTool(activity, order).catch(() => {});
					snapshot.tools.push({
						order,
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
						void persistTool(activity, entry.order).catch(() => {});
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

/**
 * Idempotent gate: if the execution is already in a terminal state, or is
 * sleeping (a durable sleep decision is pending), the run must be a no-op.
 * Returning "skipped" prevents a retry or duplicate event from re-executing
 * the same unit of work twice.
 */
export async function resolveExecutionState(data: unknown): Promise<{
	workflowId: string;
	executionId: string;
	state: "run" | "skipped";
	reason?: string;
}> {
	const parsed = executionRunEventSchema.parse(data);
	const execution = await workflowService.getExecution(parsed.executionId);
	if (!execution) {
		throw new NonRetriableError(`Execution not found: ${parsed.executionId}`);
	}
	if (
		execution.status === "completed" ||
		execution.status === "failed" ||
		execution.status === "cancelled" ||
		execution.status === "sleeping" ||
		execution.status === "waiting"
	) {
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			state: "skipped",
			reason: `execution already ${execution.status}`,
		};
	}
	return {
		workflowId: parsed.workflowId,
		executionId: parsed.executionId,
		state: "run",
	};
}

export async function runAgentStep(data: unknown): Promise<{
	workflowId: string;
	executionId: string;
	status: "running" | "skipped";
	mode: "planning" | "run";
	reason?: string;
	result?: AgentResult;
	recoveryContext?: {
		failureCode?: string;
		failureMessage?: string;
		attempt: number;
	};
}> {
	const parsed = executionRunEventSchema.parse(data);
	const execution = await workflowService.getExecution(parsed.executionId);
	if (!execution) {
		throw new NonRetriableError(`Execution not found: ${parsed.executionId}`);
	}
	if (
		execution.status === "completed" ||
		execution.status === "failed" ||
		execution.status === "cancelled"
	) {
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode: "run",
			reason: `execution already ${execution.status}`,
		};
	}
	if (execution.status === "sleeping") {
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode: "run",
			reason: "execution sleeping",
		};
	}
	if (execution.status === "waiting") {
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode: "run",
			reason: "execution waiting on webhook",
		};
	}
	const elapsedSeconds = execution.startedAt
		? (Date.now() - execution.startedAt.getTime()) / 1000
		: 0;
	if (elapsedSeconds > env.EXECUTION_MAX_SECONDS) {
		const reason = `execution exceeded the ${env.EXECUTION_MAX_SECONDS}s wall-clock budget`;
		const scheduled = await maybeScheduleRecovery(parsed, {
			code: "EXECUTION_TIME_BUDGET_EXCEEDED",
			reason,
		});
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode: "run",
			reason: scheduled
				? "recovery scheduled after time budget exceeded"
				: reason,
		};
	}
	const workflow = await workflowService.getWorkflowById(execution.workflowId);
	if (!workflow) {
		throw new NonRetriableError(`Workflow not found: ${execution.workflowId}`);
	}
	const mode: "planning" | "run" =
		workflow.status === "draft" ? "planning" : "run";
	const activity = createActivityAccumulator(workflow.id, parsed.executionId);
	const result = await runAgent({
		registry:
			mode === "planning"
				? createPlanningRegistry()
				: withExecutionCapabilities(
						createDefaultRegistry(),
						workflow.id,
						workflow.userId,
					),
		objective: parsed.prompt,
		maxSteps: env.AGENT_MAX_STEPS,
		modelContextCapChars: parsed.modelContextCapChars,
		instructions: await buildConversationInstructions(
			workflow.id,
			parsed.executionId,
			parsed.modelContextCapChars,
			mode,
			parsed.recoveryContext,
		),
		onActivity: async (next) => {
			activity.apply(next);
			await workflowService.updateActivitySnapshot(
				parsed.workflowId,
				activity.snapshot(),
			);
		},
	});
	const toolCallCount = result.steps.reduce(
		(count, step) => count + step.toolCalls.length,
		0,
	);
	if (toolCallCount > env.AGENT_MAX_TOOL_CALLS) {
		const reason = `run exceeded the ${env.AGENT_MAX_TOOL_CALLS} tool-call budget (${toolCallCount})`;
		const scheduled = await maybeScheduleRecovery(parsed, {
			code: "EXECUTION_TOOL_BUDGET_EXCEEDED",
			reason,
		});
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode,
			recoveryContext: parsed.recoveryContext,
			reason: scheduled
				? "recovery scheduled after tool-call budget exceeded"
				: reason,
		};
	}
	return {
		workflowId: parsed.workflowId,
		executionId: parsed.executionId,
		status: "running",
		mode,
		recoveryContext: parsed.recoveryContext,
		result,
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
		(execution.status === "completed" ||
			execution.status === "failed" ||
			execution.status === "cancelled" ||
			execution.status === "sleeping" ||
			execution.status === "waiting")
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
	const toolCallCount = result.steps.reduce(
		(count, step) => count + step.toolCalls.length,
		0,
	);
	await workflowService.recordSteps({
		executionId: outcome.executionId,
		steps: result.steps,
	});
	let planEmitted = false;
	let finalizedStatus:
		| "completed"
		| "sleeping"
		| "waiting"
		| "cancelled"
		| "failed" = "completed";
	if (outcome.mode === "planning") {
		const plan = extractPlan(result.text);
		if (plan) {
			await workflowService.updatePlan(outcome.workflowId, plan);
			planEmitted = true;
		}
		await workflowService.completeExecution({
			executionId: outcome.executionId,
		});
	} else {
		const execution = await workflowService.getExecution(outcome.executionId);
		const decision = extractDecision(result.text);
		if (decision && execution) {
			const maxSleepMs = env.EXECUTION_MAX_SLEEP_SECONDS * 1000;
			if (
				decision.action === "sleep" &&
				decision.sleepUntil &&
				decision.sleepUntil.getTime() - Date.now() > maxSleepMs
			) {
				decision.sleepUntil = new Date(Date.now() + maxSleepMs);
			}
			const applied = await workflowService.applyDecision({
				workflowId: outcome.workflowId,
				executionId: outcome.executionId,
				decision,
			});
			finalizedStatus =
				applied.action === "sleep"
					? "sleeping"
					: applied.action === "stop"
						? "cancelled"
						: applied.action === "wait"
							? "waiting"
							: "completed";
			if (applied.action === "sleep") {
				const activity = await workflowService.getActivitySnapshot(
					outcome.workflowId,
				);
				if (activity) {
					await workflowService.updateActivitySnapshot(outcome.workflowId, {
						...activity,
						status: "sleeping",
						currentActivity: `sleeping until ${decision.sleepUntil?.toISOString()}`,
						updatedAt: new Date(),
					});
				}
			}
			if (applied.action === "wait") {
				const activity = await workflowService.getActivitySnapshot(
					outcome.workflowId,
				);
				if (activity) {
					await workflowService.updateActivitySnapshot(outcome.workflowId, {
						...activity,
						status: "waiting",
						currentActivity: `waiting on webhook: ${decision.waitFor?.description}`,
						updatedAt: new Date(),
					});
				}
			}
		} else {
			await workflowService.completeExecution({
				executionId: outcome.executionId,
			});
		}
	}
	const activity = await workflowService.getActivitySnapshot(
		outcome.workflowId,
	);
	if (activity) {
		await workflowService.updateActivitySnapshot(outcome.workflowId, {
			...activity,
			status:
				finalizedStatus === "sleeping"
					? "sleeping"
					: finalizedStatus === "waiting"
						? "waiting"
						: "completed",
			currentActivity: undefined,
			updatedAt: new Date(),
		});
	}
	const summary = result.text.slice(0, 500);
	if (finalizedStatus === "completed" && outcome.recoveryContext) {
		await workflowService.updateRecoveryResult(
			outcome.executionId,
			outcome.recoveryContext.attempt,
			"completed",
			{ failureCode: outcome.recoveryContext.failureCode },
		);
		await storeProceduralMemory(
			outcome.workflowId,
			outcome.executionId,
			outcome.recoveryContext,
		);
	}
	if (finalizedStatus === "completed") {
		await storeEpisodicMemory(outcome.workflowId, outcome.executionId, summary);
	}
	return {
		workflowId: outcome.workflowId,
		executionId: outcome.executionId,
		status: finalizedStatus,
		summary,
		stepCount: result.steps.length,
		toolCount: toolCallCount,
		planEmitted,
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
				execution.status === "failed" ||
				execution.status === "cancelled"
			) {
				return;
			}
			const reason = (
				parsed.data.data.error?.message ??
				error.message ??
				"execution failed unexpectedly"
			).slice(0, 500);
			const classification = classifyFailure({
				code: parsed.data.data.error?.code,
			});
			const scheduled = await maybeScheduleRecovery(
				parsed.data.data.event.data,
				{
					code: classification.failureCode ?? "EXECUTION_FAILED",
					reason,
				},
			);
			void scheduled;
		},
	},
	async ({ event, step }) => {
		const resolved = await step.run("resolve-execution-state", () =>
			resolveExecutionState(event.data),
		);
		if (resolved.state === "skipped") {
			return {
				workflowId: resolved.workflowId,
				executionId: resolved.executionId,
				status: "skipped" as const,
				summary: resolved.reason ?? "skipped",
				stepCount: 0,
				toolCount: 0,
			};
		}
		const finalized = await step.run("run-agent-and-persist", () =>
			executeWorkflowRun(event.data),
		);
		return finalized;
	},
);
