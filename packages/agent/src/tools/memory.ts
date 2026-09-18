import { tool } from "ai";
import MemoryClient from "mem0ai";
import { z } from "zod";

import { type ToolContext, toolContextSchema } from "./context";

export const storeMemoryTool = tool({
	description:
		"Save a durable fact/preference about user or project to chat long-term memory (Mem0). Use for things worth remembering across sessions: preferences, decisions, credential locations (never secrets), ongoing goals.",
	inputSchema: z.object({
		text: z
			.string()
			.min(1)
			.max(2_000)
			.describe("The fact, 1–2 self-contained sentences."),
		category: z
			.enum(["preference", "decision", "fact", "goal"])
			.optional()
			.describe("What kind of memory this is."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		| { ok: true; stored: true }
		| { ok: false; error: { code: string; message: string } }
	> => {
		if (!context.mem0Key) {
			return {
				ok: false,
				error: {
					code: "MEM0_KEY_REQUIRED",
					message:
						"Memory needs a Mem0 API key. Add it in Settings → BYOK to enable remembering across this conversation.",
				},
			};
		}
		try {
			const client = new MemoryClient({ apiKey: context.mem0Key });
			await client.add([{ role: "user", content: input.text }], {
				userId: context.threadId,
				...(input.category ? { metadata: { category: input.category } } : {}),
			});
			return { ok: true, stored: true };
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "MEMORY_STORE_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});

export const searchMemoryTool = tool({
	description:
		"Search chat long-term memory (Mem0). Saved facts, preferences, decisions. Use when user references earlier discussion.",
	inputSchema: z.object({
		query: z.string().min(1),
		limit: z
			.number()
			.int()
			.min(1)
			.max(20)
			.optional()
			.describe("Max memories (default 5)."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		| { ok: true; memories: Array<{ memory: string; score?: number }> }
		| { ok: false; error: { code: string; message: string } }
	> => {
		if (!context.mem0Key) {
			return {
				ok: false,
				error: {
					code: "MEM0_KEY_REQUIRED",
					message: "Memory needs a Mem0 API key (Settings → BYOK).",
				},
			};
		}
		try {
			const client = new MemoryClient({ apiKey: context.mem0Key });
			const { results } = await client.search(input.query, {
				filters: { user_id: context.threadId },
				topK: input.limit ?? 5,
			});
			return {
				ok: true,
				memories: results.map((m) => ({
					memory: typeof m.memory === "string" ? m.memory : "",
					score: typeof m.score === "number" ? m.score : undefined,
				})),
			};
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "MEMORY_SEARCH_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});
