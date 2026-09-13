import { tool, zodSchema, type Tool } from "ai";
import { db, ids, workflows } from "@aevryn/db";
import type {
	MemoryEntry,
	MemoryService,
	PlanService,
	RunService,
	ThreadService,
} from "@aevryn/workflow";
import { z } from "zod";

import { chatToolSchemas, CHAT_TOOL_NAMES } from "./schemas";

export interface ChatToolServices {
	plan: PlanService;
	run: RunService;
	thread: ThreadService;
	memory: MemoryService;
}

export interface ChatToolActivity {
	tool: string;
	input: unknown;
	ok: boolean;
	output?: unknown;
	error?: { code: string; message: string };
	durationMs?: number;
}

export type ChatToolContext = {
	userId: string;
	workspaceId: string;
	threadId: string;
	workflowId?: string;
	autoApprove: boolean;
	services: ChatToolServices;
	onDelegateWork(input: {
		objective: string;
		instructions?: string;
	}): Promise<{ runId: string }>;
	onToolActivity?(activity: ChatToolActivity): Promise<void> | void;
};

const HTTP_RESPONSE_CAP = 200_000;
const HTTP_TIMEOUT_MS = 15_000;

function formatPlan(
	plan: { id: string; title: string; objective: string | null; status: string },
	steps: { id: string; position: number; title: string; status: string }[],
) {
	return {
		planId: plan.id,
		title: plan.title,
		objective: plan.objective ?? "",
		status: plan.status,
		steps: steps.map((s) => ({
			id: s.id,
			position: s.position,
			title: s.title,
			status: s.status,
		})),
	};
}

export function createChatTools(ctx: ChatToolContext): Record<string, Tool> {
	const services = ctx.services;

	async function act<T>(
		name: string,
		input: unknown,
		fn: () => Promise<T>,
	): Promise<T> {
		const startedAt = Date.now();
		try {
			const output = await fn();
			await ctx.onToolActivity?.({
				tool: name,
				input,
				ok: true,
				output,
				durationMs: Date.now() - startedAt,
			});
			return output;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown tool error";
			await ctx.onToolActivity?.({
				tool: name,
				input,
				ok: false,
				error: {
					code: (error as { code?: string })?.code ?? "TOOL_ERROR",
					message,
				},
				durationMs: Date.now() - startedAt,
			});
			throw error;
		}
	}

	const boundWorkflow = async (): Promise<{
		ok: boolean;
		plan: ReturnType<typeof formatPlan> | null;
	}> => {
		if (!ctx.workflowId) {
			return { ok: false, plan: null };
		}
		const steps = await services.plan.listSteps(ctx.workflowId);
		if (steps.length === 0) {
			return { ok: true, plan: null };
		}
		return {
			ok: true,
			plan: formatPlan(
				{
					id: ctx.workflowId,
					title: "Bound workflow plan",
					objective: steps[0]?.objective ?? null,
					status: "accepted",
				},
				steps,
			),
		};
	};

	const listCapabilitiesExec = async () => {
		return {
			tools: [
				{ name: "listCapabilities", description: "List available chat tools." },
				{ name: "askQuestion", description: "Ask the user a question and pause for their reply." },
				{ name: "showPlan", description: "Show the plan bound to this thread." },
				{ name: "editPlan", description: "Add/update steps or change the bound plan's status." },
				{ name: "bindWorkflow", description: "Create a workflow + plan from the user's objective and bind it to this thread." },
				{ name: "storeMemory", description: "Store a durable user fact or preference." },
				{ name: "searchMemory", description: "Recall stored facts/preferences for this user." },
				{ name: "httpRequest", description: "Issue a raw HTTP request (GET/POST/PUT/PATCH/DELETE) with a capped response." },
				{ name: "delegateAgenticWork", description: "Hand a multi-step objective to the durable worker; runs asynchronously in this thread." },
			],
		};
	};

	const askQuestionExec = async (input: z.output<typeof chatToolSchemas.askQuestion>) => {
		return act("askQuestion", input, async () => ({
			status: "pending_user_input",
			guidance:
				"Ask the user the question in plain text in your reply, then end your turn. Continue once they answer.",
		}));
	};

	const showPlanExec = async () => {
		return act("showPlan", {}, async () => {
			const current = await boundWorkflow();
			if (!current.ok) {
				return { bound: false, message: "No workflow is bound to this thread yet. Use bindWorkflow to create one." };
			}
			if (!current.plan) {
				return { bound: true, plan: null, message: "The thread has a bound workflow but no plan yet." };
			}
			return { bound: true, plan: current.plan };
		});
	};

	const editPlanExec = async (input: z.output<typeof chatToolSchemas.editPlan>) => {
		return act("editPlan", input, async () => {
			if (!ctx.workflowId) {
				return { ok: false, error: "No workflow is bound to this thread. Use bindWorkflow first." };
			}
			const previous = await boundWorkflow();
			const plan = previous.plan;
			if (!plan) {
				return { ok: false, error: "No plan exists for the bound workflow." };
			}
			if (input.action === "update_title") {
				if (!input.title) {
					return { ok: false, error: "title is required for update_title." };
				}
				// Steps hang directly off the workflow; title lives on the workflow row.
				await services.plan.setPlanObjective(ctx.workflowId, input.title);
			} else if (input.action === "add_step") {
				if (!input.title) {
					return { ok: false, error: "title is required for add_step." };
				}
				await services.plan.addStep({
					workflowId: ctx.workflowId,
					title: input.title,
					description: input.description,
				});
			} else if (input.action === "set_status") {
				if (!input.stepId || !input.status) {
					return { ok: false, error: "stepId and status are required for set_status." };
				}
				await services.plan.setStepStatus(input.stepId, input.status);
			} else {
				if (!input.stepId) {
					return { ok: false, error: "stepId is required for update_step." };
				}
				await services.plan.updateStep(input.stepId, {
					title: input.title,
					description: input.description,
					status: input.status,
				});
			}
			const updated = await boundWorkflow();
			return { ok: true, plan: updated.plan };
		});
	};

	const bindWorkflowExec = async (input: z.output<typeof chatToolSchemas.bindWorkflow>) => {
		return act("bindWorkflow", input, async () => {
			if (ctx.workflowId) {
				const existing = await boundWorkflow();
				return {
					ok: true,
					alreadyBound: true,
					workflowId: ctx.workflowId,
					plan: existing.plan,
				};
			}
			const [wf] = await db
				.insert(workflows)
				.values({
					id: ids.workflow(),
					workspaceId: ctx.workspaceId,
					userId: ctx.userId,
					title: input.title,
					description: input.objective ?? null,
					autoApprove: ctx.autoApprove,
				})
				.returning();
			if (!wf) {
				return { ok: false, error: "Could not create workflow." };
			}
			for (const [i, step] of input.steps.entries()) {
				await services.plan.addStep({
					workflowId: wf.id,
					title: step.title,
					description: step.description,
					objective: input.objective,
					position: i,
				});
			}
			await services.thread.bindWorkflow(ctx.threadId, wf.id);
			const steps = await services.plan.listSteps(wf.id);
			return {
				ok: true,
				alreadyBound: false,
				workflowId: wf.id,
				plan: formatPlan(
					{
						id: wf.id,
						title: input.title,
						objective: input.objective ?? null,
						status: "accepted",
					},
					steps,
				),
			};
		});
	};

	const storeMemoryExec = async (input: z.output<typeof chatToolSchemas.storeMemory>) => {
		return act("storeMemory", input, async () => {
			const result = await services.memory.store({
				userId: ctx.userId,
				text: input.text,
				category: input.category,
				workspaceId: ctx.workspaceId,
				threadId: ctx.threadId,
			});
			return result;
		});
	};

	const searchMemoryExec = async (input: z.output<typeof chatToolSchemas.searchMemory>) => {
		return act("searchMemory", input, async () => {
			const entries = await services.memory.search({
				userId: ctx.userId,
				query: input.query,
				limit: input.limit ?? 8,
				workspaceId: ctx.workspaceId,
				...(input.threadScope ? { threadId: ctx.threadId } : {}),
			});
			return { count: entries.length, entries };
		});
	};

	const httpRequestExec = async (input: z.output<typeof chatToolSchemas.httpRequest>) => {
		return act("httpRequest", input, async () => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
			try {
				const response = await fetch(input.url, {
					method: input.method,
					headers: input.headers ?? undefined,
					body: input.body,
					signal: controller.signal,
					redirect: "follow",
				});
				const raw = await response.text();
				const body = raw.length > HTTP_RESPONSE_CAP
					? `${raw.slice(0, HTTP_RESPONSE_CAP)}\n… (truncated)`
					: raw;
				let parsed: unknown = null;
				try {
					parsed = JSON.parse(body);
				} catch {
					parsed = null;
				}
				return {
					status: response.status,
					ok: response.ok,
					contentType: response.headers.get("content-type"),
					body,
					parsed,
				};
			} finally {
				clearTimeout(timer);
			}
		});
	};

	const delegateAgenticWorkExec = async (
		input: z.output<typeof chatToolSchemas.delegateAgenticWork>,
	) => {
		return act("delegateAgenticWork", input, async () => {
			const { runId } = await ctx.onDelegateWork({
				objective: input.objective,
				instructions: input.instructions,
			});
			return { accepted: true, runId };
		});
	};

	return {
		listCapabilities: tool<
			Record<string, never>,
			Awaited<ReturnType<typeof listCapabilitiesExec>>,
			ChatToolContext
		>({
			description:
				"List every tool available in this chat session and a one-line description of each. Use it when deciding what you can do for the user.",
			inputSchema: zodSchema(chatToolSchemas.listCapabilities),
			execute: listCapabilitiesExec,
		}),

		askQuestion: tool<
			z.output<typeof chatToolSchemas.askQuestion>,
			Awaited<ReturnType<typeof askQuestionExec>>,
			ChatToolContext
		>({
			description:
				"Surface a question to the user that must be answered before work can continue. Call this, then ask the question in plain text and end your turn; the user's next message is the answer.",
			inputSchema: zodSchema(chatToolSchemas.askQuestion),
			execute: askQuestionExec,
		}),

		showPlan: tool<
			Record<string, never>,
			Awaited<ReturnType<typeof showPlanExec>>,
			ChatToolContext
		>({
			description:
				"Show the workflow plan currently bound to this thread. Use before proposing work so you align with the existing plan.",
			inputSchema: zodSchema(chatToolSchemas.showPlan),
			execute: showPlanExec,
		}),

		editPlan: tool<
			z.output<typeof chatToolSchemas.editPlan>,
			Awaited<ReturnType<typeof editPlanExec>>,
			ChatToolContext
		>({
			description:
				"Modify the plan bound to this thread: add a step, update a step, change a step's status, or rename the plan. Returns the updated plan.",
			inputSchema: zodSchema(chatToolSchemas.editPlan),
			execute: editPlanExec,
		}),

		bindWorkflow: tool<
			z.output<typeof chatToolSchemas.bindWorkflow>,
			Awaited<ReturnType<typeof bindWorkflowExec>>,
			ChatToolContext
		>({
			description:
				"Establish a new workflow + plan from the user's objective and bind it to this thread. Use when the user's request is a multi-step objective. Idempotent: if a workflow is already bound, returns the current plan.",
			inputSchema: zodSchema(chatToolSchemas.bindWorkflow),
			execute: bindWorkflowExec,
		}),

		storeMemory: tool<
			z.output<typeof chatToolSchemas.storeMemory>,
			Awaited<ReturnType<typeof storeMemoryExec>>,
			ChatToolContext
		>({
			description:
				"Persist a durable fact or user preference (or a procedural note about how work should be done). Returns the stored memory id.",
			inputSchema: zodSchema(chatToolSchemas.storeMemory),
			execute: storeMemoryExec,
		}),

		searchMemory: tool<
			z.output<typeof chatToolSchemas.searchMemory>,
			Awaited<ReturnType<typeof searchMemoryExec>>,
			ChatToolContext
		>({
			description:
				"Search the user's stored memory (facts, preferences, procedures). Set threadScope to true to restrict recall to this thread's memories.",
			inputSchema: zodSchema(chatToolSchemas.searchMemory),
			execute: searchMemoryExec,
		}),

		httpRequest: tool<
			z.output<typeof chatToolSchemas.httpRequest>,
			Awaited<ReturnType<typeof httpRequestExec>>,
			ChatToolContext
		>({
			description:
				"Issue a raw HTTP request to the given URL. The response body is capped; use it to fetch public data or call APIs the user asked about. Never send credentials.",
			inputSchema: zodSchema(chatToolSchemas.httpRequest),
			execute: httpRequestExec,
		}),

		delegateAgenticWork: tool<
			z.output<typeof chatToolSchemas.delegateAgenticWork>,
			Awaited<ReturnType<typeof delegateAgenticWorkExec>>,
			ChatToolContext
		>({
			description:
				"Hand a multi-step, durable objective to the background worker. The worker can schedule, wait on webhooks, and use the full agent toolkit; progress surfaces as activities in this thread. Returns immediately with the new run id.",
			inputSchema: zodSchema(chatToolSchemas.delegateAgenticWork),
			execute: delegateAgenticWorkExec,
		}),
	};
}

export type { MemoryEntry };

export function chatToolNamesUsed(): string[] {
	return CHAT_TOOL_NAMES as unknown as string[];
}