import {
	type AgentActivity,
	type AgentResult,
	createDefaultRegistry,
	runAgent,
	withExecutionCapabilities,
} from "@aevryn/agent";
import { env } from "@aevryn/env/server";
import {
	ApprovalService,
	classifyFailure,
	NotificationService,
	RunService,
	ThreadService,
	WebhookHookService,
} from "@aevryn/workflow";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { inngest } from "../client";
import {
	type ThreadRunResult,
	notificationPublishEvent,
	queueDeliverEvent,
	threadRunEvent,
	threadRunEventSchema,
} from "../events";
import { extractDecision } from "./helpers/decisions";
import {
	getConversationContext,
	retrieveRelevantMemory,
	storeEpisodicMemory,
	storeProceduralMemory,
} from "./helpers/memory";
import { buildRunInstructions } from "./helpers/prompts";

const runService = new RunService();
const threadService = new ThreadService();
const notificationService = new NotificationService();
const approvalService = new ApprovalService();
const webhookHookService = new WebhookHookService();

const failureEventSchema = z.object({
	data: z.object({
		event: z.object({
			data: threadRunEventSchema,
		}),
		error: z
			.object({
				message: z.string().optional(),
				code: z.string().optional(),
			})
			.optional(),
	}),
});

/**
 * Bounded recovery: classify the failure, record the attempt (idempotent per
 * (runId, attempt) in run_activities), and re-enqueue the SAME run with a
 * recoveryContext the next pass can see. Re-enqueues only when THIS call was
 * the one that recorded the attempt, so concurrent failure handlers cannot
 * double-schedule. Fatal failures or attempts past RECOVERY_MAX_ATTEMPTS fall
 * through to a durable fail.
 */
async function maybeScheduleRecovery(
	data: {
		runId: string;
		threadId: string;
		userId: string;
		workspaceId: string;
		prompt: string;
		modelContextCapChars?: number;
	},
	failure: { code: string; reason: string },
): Promise<boolean> {
	const classification = classifyFailure({ code: failure.code });
	const attempts = await runService.countRecoveryAttempts(data.runId);
	const attempt = attempts + 1;
	if (
		classification.failureClass === "fatal" ||
		attempt > env.RECOVERY_MAX_ATTEMPTS
	) {
		await runService.recordRecoveryAttempt(data.runId, {
			attempt,
			failureClass: classification.failureClass,
			failureCode: classification.failureCode,
			strategy: "fail-safe",
			result: "failed",
			detail: { reason: failure.reason },
		});
		await runService.setStatus(data.runId, "failed");
		try {
			await notificationService.create({
				userId: data.userId,
				workspaceId: data.workspaceId,
				threadId: data.threadId,
				type: "run",
				title: "Run failed",
				body: JSON.stringify({
					failureClass: classification.failureClass,
					failureCode: classification.failureCode,
					reason: failure.reason,
				}),
			});
		} catch {
			// Notification persistence must never fail the fail-safe path.
		}
		return false;
	}
	const recorded = await runService.recordRecoveryAttempt(data.runId, {
		attempt,
		failureClass: classification.failureClass,
		failureCode: classification.failureCode,
		strategy: "bounded-retry",
		result: "started",
		detail: { reason: failure.reason },
	});
	if (!recorded) {
		return true;
	}
	await inngest.send({
		name: threadRunEvent,
		data: {
			runId: data.runId,
			threadId: data.threadId,
			prompt: data.prompt,
			modelContextCapChars: data.modelContextCapChars,
			recoveryContext: {
				failureCode: classification.failureCode,
				failureMessage: failure.reason,
				attempt,
			},
		},
	});
	return true;
}

/**
 * Persist live agent activity into the run's run_activities rows. Tool rows
 * key on `step_label = tool name` so a later bounded-recovery pass can replay
 * completed outputs without re-invoking the provider (see
 * RunService.listReplayableToolOutputs). Agent steps land as `thinking` rows.
 */
function createActivityAccumulator(runId: string) {
	let toolCounter = 0;
	const activeByIndex = new Map<number, string>();
	const activeByName = new Map<string, number[]>();
	const createTool = async (tool: string, input: unknown): Promise<string> => {
		const row = await runService.createActivity({
			runId,
			type: "tool",
			status: "active",
			stepLabel: tool,
			title: tool,
			detail: { input },
		});
		return row.id;
	};

	return {
		async apply(activity: AgentActivity): Promise<void> {
			switch (activity.type) {
				case "tool-start": {
					const index = toolCounter++;
					const activityId = await createTool(activity.tool, activity.input);
					activeByIndex.set(index, activityId);
					activeByName.set(activity.tool, [
						...(activeByName.get(activity.tool) ?? []),
						index,
					]);
					break;
				}
				case "tool-end": {
					const indices = activeByName.get(activity.tool);
					const index = indices?.shift();
					const activityId = index == null ? undefined : activeByIndex.get(index);
					if (index != null) {
						activeByIndex.delete(index);
					}
					if (activityId) {
						await runService.updateActivityStatus(
							activityId,
							activity.status === "completed" ? "complete" : "failed",
						);
					}
					break;
				}
				case "step-end": {
					await runService.createActivity({
						runId,
						type: "thinking",
						status: "complete",
						stepLabel: `step-${activity.step}`,
						title: "Step summary",
						detail: { step: activity.step, text: activity.text },
					});
					break;
				}
			}
		},
	};
}

/**
 * Idempotent gate: if the run is already terminal, sleeping, waiting, or
 * awaiting approval, the pass must be a no-op. Returning "skipped" prevents a
 * retry or duplicate event from re-executing the same unit of work twice.
 */
export async function resolveRunState(data: unknown): Promise<{
	runId: string;
	threadId: string;
	state: "run" | "skipped";
	reason?: string;
}> {
	const parsed = threadRunEventSchema.parse(data);
	const run = await runService.findById(parsed.runId);
	if (!run) {
		throw new NonRetriableError(`Run not found: ${parsed.runId}`);
	}
	if (
		run.status === "completed" ||
		run.status === "failed" ||
		run.status === "cancelled" ||
		run.status === "sleeping" ||
		run.status === "waiting" ||
		run.status === "awaiting_approval"
	) {
		return {
			runId: parsed.runId,
			threadId: parsed.threadId,
			state: "skipped",
			reason: `run already ${run.status}`,
		};
	}
	return {
		runId: parsed.runId,
		threadId: parsed.threadId,
		state: "run",
	};
}

export async function runAgentStep(data: unknown): Promise<{
	runId: string;
	threadId: string;
	status: "running" | "skipped";
	reason?: string;
	result?: AgentResult;
	recoveryContext?: {
		failureCode?: string;
		failureMessage?: string;
		attempt: number;
	};
}> {
	const parsed = threadRunEventSchema.parse(data);
	const run = await runService.findById(parsed.runId);
	if (!run) {
		throw new NonRetriableError(`Run not found: ${parsed.runId}`);
	}
	if (
		run.status === "completed" ||
		run.status === "failed" ||
		run.status === "cancelled" ||
		run.status === "sleeping" ||
		run.status === "waiting" ||
		run.status === "awaiting_approval"
	) {
		return {
			runId: parsed.runId,
			threadId: parsed.threadId,
			status: "skipped",
			reason: `run already ${run.status}`,
		};
	}
const elapsedSeconds = (Date.now() - run.createdAt.getTime()) / 1000;
	const thread = await threadService.findById(parsed.threadId);
	if (!thread) {
		throw new NonRetriableError(`Thread not found: ${parsed.threadId}`);
	}
	const workspaceId = thread.workspaceId;
	if (elapsedSeconds > env.EXECUTION_MAX_SECONDS) {
		const reason = `run exceeded the ${env.EXECUTION_MAX_SECONDS}s wall-clock budget`;
		const scheduled = await maybeScheduleRecovery(
			{
				runId: parsed.runId,
				threadId: parsed.threadId,
				userId: run.userId,
				workspaceId,
				prompt: parsed.prompt,
				modelContextCapChars: parsed.modelContextCapChars,
			},
			{ code: "EXECUTION_TIME_BUDGET_EXCEEDED", reason },
		);
		return {
			runId: parsed.runId,
			threadId: parsed.threadId,
			status: "skipped",
			reason: scheduled
				? "recovery scheduled after time budget exceeded"
				: reason,
		};
	}
	const replay =
		parsed.recoveryContext !== undefined
			? await runService.listReplayableToolOutputs(parsed.runId)
			: undefined;
	const accumulator = createActivityAccumulator(parsed.runId);
	const conversation = await getConversationContext(
		parsed.threadId,
		parsed.runId,
		parsed.modelContextCapChars,
	);
	const memory = await retrieveRelevantMemory({
		userId: run.userId,
		workflowId: thread.boundWorkflowId ?? undefined,
		threadId: parsed.threadId,
		workspaceId: thread.workspaceId,
		query: parsed.prompt,
		preferProcedural: parsed.recoveryContext !== undefined,
	});
	const instructions = buildRunInstructions({
		recoveryContext: parsed.recoveryContext,
		conversationContext: [conversation, memory].filter(Boolean).join("\n\n"),
	});
	const result = await runAgent({
		registry: withExecutionCapabilities(createDefaultRegistry(), {
			workflowId: thread.boundWorkflowId ?? undefined,
			threadId: parsed.threadId,
			workspaceId: thread.workspaceId,
			userId: run.userId,
		}),
		objective: parsed.prompt,
		maxSteps: env.AGENT_MAX_STEPS,
		modelContextCapChars: parsed.modelContextCapChars,
		instructions,
		onActivity: (activity) => accumulator.apply(activity),
		replayedToolOutputs: replay,
		approvedToolNames: parsed.approvedToolNames,
	});
	try {
		await runService.recordUsage(parsed.runId, {
			tokenCount: result.usage.totalTokens,
			costUsd: result.usage.costUsd,
		});
	} catch {
		// Usage persistence is best-effort and never fails a run.
	}
	if (result.usage.costUsd > env.EXECUTION_MAX_COST_USD) {
		const reason = `run exceeded the $${env.EXECUTION_MAX_COST_USD} cost budget ($${result.usage.costUsd.toFixed(6)})`;
		const scheduled = await maybeScheduleRecovery(
			{
				runId: parsed.runId,
				threadId: parsed.threadId,
				userId: run.userId,
				workspaceId: thread.workspaceId,
				prompt: parsed.prompt,
				modelContextCapChars: parsed.modelContextCapChars,
			},
			{ code: "EXECUTION_COST_BUDGET_EXCEEDED", reason },
		);
		return {
			runId: parsed.runId,
			threadId: parsed.threadId,
			status: "skipped",
			recoveryContext: parsed.recoveryContext,
			reason: scheduled
				? "recovery scheduled after cost budget exceeded"
				: reason,
		};
	}
	const toolCallCount = result.steps.reduce(
		(count, step) => count + step.toolCalls.length,
		0,
	);
	if (toolCallCount > env.AGENT_MAX_TOOL_CALLS) {
		const reason = `run exceeded the ${env.AGENT_MAX_TOOL_CALLS} tool-call budget (${toolCallCount})`;
		const scheduled = await maybeScheduleRecovery(
			{
				runId: parsed.runId,
				threadId: parsed.threadId,
				userId: run.userId,
				workspaceId: thread.workspaceId,
				prompt: parsed.prompt,
				modelContextCapChars: parsed.modelContextCapChars,
			},
			{ code: "EXECUTION_TOOL_BUDGET_EXCEEDED", reason },
		);
		return {
			runId: parsed.runId,
			threadId: parsed.threadId,
			status: "skipped",
			recoveryContext: parsed.recoveryContext,
			reason: scheduled
				? "recovery scheduled after tool-call budget exceeded"
				: reason,
		};
	}
	return {
		runId: parsed.runId,
		threadId: parsed.threadId,
		status: "running",
		recoveryContext: parsed.recoveryContext,
		result,
	};
}

export async function persistAndCompleteStep(
	outcome: Awaited<ReturnType<typeof runAgentStep>>,
): Promise<ThreadRunResult> {
	if (outcome.status === "skipped") {
		return {
			runId: outcome.runId,
			threadId: outcome.threadId,
			status: "skipped",
			summary: "",
			stepCount: 0,
			toolCount: 0,
		};
	}
	const run = await runService.findById(outcome.runId);
	if (
		!run ||
		run.status === "completed" ||
		run.status === "failed" ||
		run.status === "cancelled" ||
		run.status === "sleeping" ||
		run.status === "waiting"
	) {
		return {
			runId: outcome.runId,
			threadId: outcome.threadId,
			status: "skipped",
			summary: "",
			stepCount: 0,
			toolCount: 0,
		};
	}
	const thread = await threadService.findById(outcome.threadId);
	if (!thread) {
		throw new NonRetriableError(`Thread not found: ${outcome.threadId}`);
	}
	const result = outcome.result;
	if (!result) {
		throw new NonRetriableError(
			`No agent result for run: ${outcome.runId}`,
		);
	}
	const toolCallCount = result.steps.reduce(
		(count, step) => count + step.toolCalls.length,
		0,
	);
	let finalizedStatus: ThreadRunResult["status"] = "completed";
	const decision = extractDecision(result.text);
	let heldForApproval = false;

	const requiredApprovals = result.pendingApprovals.filter(
		(p) => p.input !== undefined && p.input !== null,
	);
	if (requiredApprovals.length > 0) {
		const created: Array<{ toolName: string }> = [];
		for (const pending of requiredApprovals) {
			const row = await approvalService.create({
				runId: outcome.runId,
				userId: run.userId,
				toolName: pending.toolName,
				input: pending.input,
				threadId: outcome.threadId,
				workflowId: thread.boundWorkflowId ?? undefined,
			});
			created.push({ toolName: row.toolName });
		}
		if (created.length > 0) {
			await runService.setStatus(outcome.runId, "awaiting_approval");
			try {
				await notificationService.create({
					userId: run.userId,
					workspaceId: thread.workspaceId,
					threadId: outcome.threadId,
					type: "system",
					title: "Awaiting approval",
					body: JSON.stringify({
						tools: [...new Set(created.map((a) => a.toolName))],
						runId: outcome.runId,
					}),
				});
			} catch {
				// Best-effort.
			}
			try {
				await threadService.insertSystemMessage(
					outcome.threadId,
					run.userId,
					`Waiting for your approval to run: ${[
						...new Set(created.map((a) => a.toolName)),
					].join(", ")}.`,
				);
			} catch {
				// Best-effort.
			}
			heldForApproval = true;
		}
	}

	if (decision && heldForApproval) {
		finalizedStatus = "awaiting_approval";
	} else if (decision) {
		if (decision.action === "sleep") {
			let sleepUntil = decision.sleepUntil;
			if (!sleepUntil) {
				sleepUntil = new Date(Date.now());
			}
			if (
				sleepUntil.getTime() - Date.now() >
				env.EXECUTION_MAX_SLEEP_SECONDS * 1000
			) {
				sleepUntil = new Date(
					Date.now() + env.EXECUTION_MAX_SLEEP_SECONDS * 1000,
				);
			}
			await runService.sleepUntil(outcome.runId, sleepUntil, decision.reason);
			finalizedStatus = "sleeping";
			try {
				await notificationService.create({
					userId: run.userId,
					workspaceId: thread.workspaceId,
					threadId: outcome.threadId,
					type: "run",
					title: "Run sleeping",
					body: JSON.stringify({
						sleepUntil: sleepUntil.toISOString(),
						reason: decision.reason,
						runId: outcome.runId,
					}),
				});
			} catch {
				// Best-effort.
			}
			try {
				await threadService.insertSystemMessage(
					outcome.threadId,
					run.userId,
					`Run sleeping until ${sleepUntil.toISOString()}.`,
				);
			} catch {
				// Best-effort.
			}
		} else if (decision.action === "notify") {
			const isWebhook = decision.notification?.channel === "webhook";
			if (decision.notification) {
				const deliveryType = isWebhook ? "webhook" : "run";
				try {
					const row = await notificationService.create({
						userId: run.userId,
						workspaceId: thread.workspaceId,
						threadId: outcome.threadId,
						type: deliveryType,
						title:
							decision.notification.subject ??
							decision.reason ??
							"Notification",
						body: isWebhook
							? JSON.stringify(decision.notification.body ?? {})
							: JSON.stringify({
									...(decision.notification.body ?? {}),
									reason: decision.reason,
									runId: outcome.runId,
								}),
					});
					if (isWebhook) {
						await inngest.send({
							name: notificationPublishEvent,
							data: { notificationId: row.id, runId: outcome.runId },
						});
					}
				} catch {
					// Best-effort.
				}
			}
			await runService.setStatus(outcome.runId, "completed");
			finalizedStatus = "completed";
		} else if (decision.action === "stop") {
			await runService.setStatus(outcome.runId, "cancelled");
			finalizedStatus = "cancelled";
		} else if (decision.action === "wait") {
			await runService.setStatus(outcome.runId, "waiting");
			const { url } = await webhookHookService.mint({
				runId: outcome.runId,
				workspaceId: thread.workspaceId,
				threadId: outcome.threadId,
				userId: run.userId,
				instruction: decision.waitFor?.description ?? "",
				expiresInSeconds: decision.waitFor?.expiresInSeconds,
				reason: decision.reason,
			});
			try {
				await notificationService.create({
					userId: run.userId,
					workspaceId: thread.workspaceId,
					threadId: outcome.threadId,
					type: "system",
					title: "Waiting for external event",
					body: JSON.stringify({
						url,
						instruction: decision.waitFor?.description,
						reason: decision.reason,
						runId: outcome.runId,
					}),
				});
			} catch {
				// Best-effort.
			}
			try {
				await threadService.insertSystemMessage(
					outcome.threadId,
					run.userId,
					`Waiting for an external event (webhook: ${url}).`,
				);
			} catch {
				// Best-effort.
			}
			finalizedStatus = "waiting";
		} else {
			await runService.setStatus(outcome.runId, "completed");
			finalizedStatus = "completed";
		}
		if (decision.planProgress) {
			try {
				await runService.createActivity({
					runId: outcome.runId,
					type: "system",
					status: "complete",
					stepLabel: "plan.progress",
					title: `Step ${decision.planProgress.currentStep}`,
					detail: decision.planProgress,
				});
			} catch {
				// Best-effort.
			}
		}
	} else {
		await runService.setStatus(outcome.runId, "completed");
		finalizedStatus = "completed";
	}

	const summary = result.text.slice(0, 500);
	if (finalizedStatus === "completed" && outcome.recoveryContext) {
		await runService.updateRecoveryResult(
			outcome.runId,
			outcome.recoveryContext.attempt,
			"completed",
			{ failureCode: outcome.recoveryContext.failureCode },
		);
		await storeProceduralMemory({
			userId: run.userId,
			workflowId: thread.boundWorkflowId ?? undefined,
			threadId: outcome.threadId,
			workspaceId: thread.workspaceId,
			runId: outcome.runId,
			threadTitle: thread.title,
			recoveryContext: outcome.recoveryContext,
		});
	}
	if (finalizedStatus === "completed") {
		await storeEpisodicMemory({
			userId: run.userId,
			workflowId: thread.boundWorkflowId ?? undefined,
			threadId: outcome.threadId,
			workspaceId: thread.workspaceId,
			runId: outcome.runId,
			threadTitle: thread.title,
			summary,
		});
		try {
			await inngest.send({
				name: queueDeliverEvent,
				data: { threadId: outcome.threadId },
			});
		} catch {
			// Best-effort: a missed event just means queued messages wait for the
			// next delivery trigger.
		}
	}
	return {
		runId: outcome.runId,
		threadId: outcome.threadId,
		status: finalizedStatus,
		summary,
		stepCount: result.steps.length,
		toolCount: toolCallCount,
	};
}

export async function executeThreadRun(data: unknown): Promise<ThreadRunResult> {
	const outcome = await runAgentStep(data);
	return persistAndCompleteStep(outcome);
}

export const threadRun = inngest.createFunction(
	{
		id: "thread-run",
		retries: 2,
		triggers: [{ event: threadRunEvent }],
		onFailure: async ({ event, error }) => {
			const parsed = failureEventSchema.safeParse(event);
			if (!parsed.success) {
				return;
			}
			const { runId, threadId, prompt, modelContextCapChars } =
				parsed.data.data.event.data;
			const run = await runService.findById(runId);
			if (
				!run ||
				run.status === "completed" ||
				run.status === "failed" ||
				run.status === "cancelled"
			) {
				return;
			}
			const reason = (
				parsed.data.data.error?.message ??
				error.message ??
				"run failed unexpectedly"
			).slice(0, 500);
			const classification = classifyFailure({
				code: parsed.data.data.error?.code,
			});
			const thread = await threadService.findById(threadId);
			await maybeScheduleRecovery(
				{
					runId,
					threadId,
					userId: run.userId,
					workspaceId: thread?.workspaceId ?? "",
					prompt,
					modelContextCapChars,
				},
				{
					code: classification.failureCode ?? "EXECUTION_FAILED",
					reason,
				},
			);
		},
	},
	async ({ event, step }) => {
		const resolved = await step.run("resolve-run-state", () =>
			resolveRunState(event.data),
		);
		if (resolved.state === "skipped") {
			return {
				runId: resolved.runId,
				threadId: resolved.threadId,
				status: "skipped" as const,
				summary: resolved.reason ?? "skipped",
				stepCount: 0,
				toolCount: 0,
			};
		}
		const finalized = await step.run("run-agent-and-persist", () =>
			executeThreadRun(event.data),
		);
		return finalized;
	},
);

// Referenced types: work around unused-import diagnostics in environments that
// prune side-effect-free symbols.
export type { ThreadRunResult };