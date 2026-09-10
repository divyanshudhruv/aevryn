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
	notificationPublishEvent,
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
- {"action":"notify","notification":{"type":"alert","subject":"...","body":{...}},"reason":"..."} to send the user a notification and finish. To deliver OUTSIDE the app, set "channel":"webhook" and put the destination in "body":{"url":"https://..."} (the payload is POSTed to that URL; the user's notification bell also records it).
- {"action":"stop","reason":"..."} to cancel this run.
- {"action":"wait","waitFor":{"description":"<what external event this run waits for>","expiresInSeconds":<optional, 60..2592000>},"notification":{"type":"webhook","subject":"...","body":{...}}} to pause this run on a durable webhook. The user is told the webhook URL; when they POST to it, this run resumes with the payload handed back as instruction context.
- {"action":"complete","reason":"<concise evidence of what was accomplished>","observation":{"type":"...","content":{...}},"planProgress":{"currentStep":<index+1>,"status":"completed"}} to finish.

Plan progress: when a stored plan exists, a decision block may include "planProgress":{"currentStep":<number of steps fully done, 0 or more>,"status":"in_progress"|"completed"}. Emit it whenever a step finishes; the final complete must set "status":"completed". The UI renders this as live progress against the stored plan.

Verification: before emitting complete for an objective that depends on the outside world, make one verification tool call (re-check the page/price/status) and include the observation evidence in the reason. Do not claim completion you did not verify.

If no decision block is needed (the normal case, e.g. objective finished), emit none and the run is marked complete. Keep your visible answer plain text.`;

const RECOVERY_HINTS: Record<string, string> = {
	ANAKIN_JOB_FAILED:
		"The provider ran the job but reported failure. Retry once with a different, simpler input format (fewer URLs, shorter query, plain format instead of structured).",
	ANAKIN_JOB_REJECTED:
		"The call was rejected before running. Check the request shape and re-issue with a corrected parameter set.",
	ANAKIN_NOT_FOUND:
		"The URL or resource no longer exists. Find the new location (search first) and point the next call at the updated target.",
	ANAKIN_AUTHENTICATION_FAILED:
		"An authenticated session is invalid or missing. List browser sessions; if none fits, create one and have the user complete the login flow before continuing.",
	ANAKIN_FORBIDDEN:
		"Permissions block this action. Do not retry blindly; adjust scope, switch to a read-only capability, or stop.",
	ANAKIN_INVALID_REQUEST:
		"The request was malformed for the provider. Change the input shape, then retry.",
	ANAKIN_UNSUPPORTED_PAGE:
		"The page blocks this capability (JS-heavy, PDF, video). Switch approach: jsRender/HTML format, summary format, or research instead.",
	ANAKIN_WIRE_AUTH_REQUIRED:
		"The destination service needs a login/authorization. Either proceed read-only, or create a browser session and have the user log in.",
	ANAKIN_WIRE_ACTION_REJECTED:
		"The destination rejected the write action. Do not auto-retry a mutation; verify the state and ask the user before re-proposing.",
	SCRAPE_EMPTY_CONTENT:
		"The page returned no readable content. Re-scrape with jsRender=1 or the HTML/summary format, or use a different URL (search result vs canonical page).",
	CRAWL_NO_URLS:
		"No crawlable links. The site may gate content or need a session; fall back to scrapeUrl on the specific pages you need.",
	SEARCH_NO_RESULTS:
		"The query returned nothing. Reword, widen, or switch provider perspective before retrying.",
	EXECUTION_TIME_BUDGET_EXCEEDED:
		"The previous pass ran out of wall-clock time. Tighten the approach: fewer, more targeted tool calls and immediate decision emission.",
	EXECUTION_TOOL_BUDGET_EXCEEDED:
		"The previous pass used too many tool calls. Consolidate steps and make each call count.",
};

function recoveryBlock(context: {
	attempt: number;
	failureCode?: string;
	failureMessage?: string;
}): string {
	const hint = context.failureCode
		? RECOVERY_HINTS[context.failureCode]
		: undefined;
	return `This run is a bounded recovery attempt (attempt ${context.attempt}) after a previous failure: ${context.failureMessage ?? context.failureCode ?? "unknown error"}.
${hint ? `Targeted guidance for ${context.failureCode}: ${hint}` : "Diagnose, adjust your approach, and continue the original objective."}
Treat any retrieval from procedural memory as the proven way forward and reuse it. Do not start new consequential side effects speculatively. Successfully completed tool results from the previous attempt are replayed to you instead of being re-invoked — do not re-run them.`;
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
	const workflow = await workflowService.getWorkflowById(workflowId);
	const customPrompt = workflow?.customPrompt
		? `CUSTOM PROMPT (follow this before the standard instructions below):\n${workflow.customPrompt}`
		: null;
	if (mode === "planning") {
		let base = PLANNING_SYSTEM_INSTRUCTIONS;
		if (customPrompt) {
			base = `${customPrompt}\n\n${base}`;
		}
		return context ? `${base}\n\n${context}` : base;
	}
	let base = RUN_DECISION_INSTRUCTIONS;
	if (customPrompt) {
		base = `${customPrompt}\n\n${base}`;
	}
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
	if (execution.status === "awaiting_approval") {
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode: "run",
			reason: "execution awaiting user approval",
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
	const replay =
		parsed.recoveryContext !== undefined
			? await workflowService.listReplayableToolOutputs(parsed.executionId)
			: undefined;
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
		replayedToolOutputs: replay,
		approvedToolNames: parsed.approvedToolNames,
	});
	const toolCallCount = result.steps.reduce(
		(count, step) => count + step.toolCalls.length,
		0,
	);
	try {
		await workflowService.recordUsage(parsed.executionId, {
			tokenCount: result.usage.totalTokens,
			costUsd: result.usage.costUsd,
		});
	} catch {
		// Usage persistence is best-effort and never fails a run.
	}
	if (result.usage.costUsd > env.EXECUTION_MAX_COST_USD) {
		const reason = `run exceeded the $${env.EXECUTION_MAX_COST_USD} cost budget ($${result.usage.costUsd.toFixed(6)})`;
		const scheduled = await maybeScheduleRecovery(parsed, {
			code: "EXECUTION_COST_BUDGET_EXCEEDED",
			reason,
		});
		return {
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			status: "skipped",
			mode,
			recoveryContext: parsed.recoveryContext,
			reason: scheduled
				? "recovery scheduled after cost budget exceeded"
				: reason,
		};
	}
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
		| "failed"
		| "awaiting_approval" = "completed";
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
		const requiredApprovals = execution
			? result.pendingApprovals.filter(
					(p) => p.input !== undefined && p.input !== null,
				)
			: [];
		let heldForApproval = false;
		if (execution && requiredApprovals.length > 0) {
			const created = await workflowService.recordApprovalRequests(
				outcome.workflowId,
				outcome.executionId,
				requiredApprovals.map((p) => ({
					toolName: p.toolName,
					input: p.input,
				})),
			);
			if (created.length > 0) {
				await workflowService.holdExecutionForApproval(
					outcome.executionId,
					`Awaiting approval for: ${[...new Set(created.map((a) => a.toolName))].join(", ")}`,
				);
				heldForApproval = true;
			}
		}
		const decision = extractDecision(result.text);
		if (decision && execution && !heldForApproval) {
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
			if (applied.action === "notify" && applied.deliverables.length > 0) {
				for (const deliverable of applied.deliverables) {
					await inngest.send({
						name: notificationPublishEvent,
						data: { notificationId: deliverable.notificationId },
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
		} else if (heldForApproval) {
			finalizedStatus = "awaiting_approval";
			const heldActivity = await workflowService.getActivitySnapshot(
				outcome.workflowId,
			);
			if (heldActivity) {
				await workflowService.updateActivitySnapshot(outcome.workflowId, {
					...heldActivity,
					status: "awaiting_approval",
					currentActivity: "waiting for user approval",
					updatedAt: new Date(),
				});
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
						: finalizedStatus === "awaiting_approval"
							? "awaiting_approval"
							: "completed",
			currentActivity:
				finalizedStatus === "awaiting_approval"
					? "waiting for user approval"
					: undefined,
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
