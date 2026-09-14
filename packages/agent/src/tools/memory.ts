import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";

const MEM0_BASE_URL = "https://api.mem0.ai/v1";

async function mem0Request(
	path: string,
	body: Record<string, unknown>,
	mem0Key: string,
): Promise<unknown> {
	const response = await fetch(`${MEM0_BASE_URL}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Token ${mem0Key}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Mem0 ${path} failed (${response.status}): ${text.slice(0, 200)}`);
	}
	return response.json();
}


export const storeMemoryTool = tool({
	description:
		"Save a durable fact or preference about the user/project to this conversation's long-term memory (Mem0). Use for things worth remembering across the chat: preferences, decisions, credentials locations (never secrets), ongoing goals.",
	inputSchema: z.object({
		text: z.string().min(1).max(2_000).describe("The fact to remember, one self-contained sentence or two."),
		category: z
			.enum(["preference", "decision", "fact", "goal"])
			.optional()
			.describe("What kind of memory this is."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<{ ok: true; stored: true } | { ok: false; error: { code: string; message: string } }> => {
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
			await mem0Request(
				"/memories",
				{
					messages: [
						{ role: "user", content: input.text },
					],
					user_id: context.threadId,
					metadata: input.category ? { category: input.category } : undefined,
					version: "v2",
				},
				context.mem0Key,
			);
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
		"Search this conversation's long-term memory (Mem0) for previously saved facts, preferences, or decisions. Use when the user refers to something discussed before.",
	inputSchema: z.object({
		query: z.string().min(1).describe("What to look up."),
		limit: z.number().int().min(1).max(20).optional().describe("Max memories returned (default 5)."),
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
			const results = (await mem0Request(
				"/memories/search",
				{
					query: input.query,
					user_id: context.threadId,
					limit: input.limit ?? 5,
					version: "v2",
				},
				context.mem0Key,
			)) as Array<{ memory?: string; text?: string; score?: number }>;

			return {
				ok: true,
				memories: results.map((m) => ({
					memory: m.memory ?? m.text ?? "",
					score: m.score,
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
