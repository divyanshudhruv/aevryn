import { z } from "zod";

/**
 * Single source of truth for the live-chat tool inputs. Both the server route
 * (tools) and the client (composer affordances) import from here, so the
 * schemas can never drift apart.
 */
export const chatToolSchemas = {
	listCapabilities: z.object({}).strict(),

	askQuestion: z
		.object({
			question: z.string().min(1).max(500),
			context: z.string().max(1000).optional(),
		})
		.strict(),

	showPlan: z.object({}).strict(),

	editPlan: z
		.object({
			action: z.enum(["add_step", "update_step", "set_status", "update_title"]),
			stepId: z.string().min(1).optional(),
			title: z.string().max(200).optional(),
			description: z.string().max(2000).optional(),
			status: z.enum(["pending", "active", "completed", "skipped"]).optional(),
		})
		.strict(),

	bindWorkflow: z
		.object({
			title: z.string().min(1).max(200),
			objective: z.string().max(2000).optional(),
			steps: z
				.array(
					z.object({
						title: z.string().min(1).max(200),
						description: z.string().max(2000).optional(),
					}),
				)
				.max(50),
		})
		.strict(),

	storeMemory: z
		.object({
			text: z.string().min(1).max(4000),
			category: z.enum(["working", "episodic", "semantic", "procedural"]).optional(),
		})
		.strict(),

	searchMemory: z
		.object({
			query: z.string().min(1).max(500),
			limit: z.number().int().min(1).max(20).optional(),
			threadScope: z.boolean().optional(),
		})
		.strict(),

	httpRequest: z
		.object({
			url: z.string().url().min(1).max(2000),
			method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
			headers: z.record(z.string(), z.string()).optional(),
			body: z.string().max(5000).optional(),
		})
		.strict(),

	delegateAgenticWork: z
		.object({
			objective: z.string().min(1).max(2000),
			instructions: z.string().max(2000).optional(),
		})
		.strict(),
} as const;

export type ChatToolName = keyof typeof chatToolSchemas;

export const CHAT_TOOL_NAMES = Object.keys(chatToolSchemas) as ChatToolName[];

/**
 * Shared exports for the web client: the composer and the question-reply form
 * render against the same schemas the server validates with, so tool contracts
 * can never drift between apps/web and the agent package.
 */
export const askQuestionSchema = chatToolSchemas.askQuestion;
export type AskQuestionInput = z.output<typeof chatToolSchemas.askQuestion>;