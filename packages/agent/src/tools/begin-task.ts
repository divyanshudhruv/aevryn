import { tool } from "ai";
import { z } from "zod";

/**
 * beginTask — the model announces the start of a distinct subtask.
 *
 * Pure UI-signaling tool: executes instantly and returns ok. The timeline
 * consumes the emitted tool part as (a) a card boundary — a beginTask call
 * closes the previous thinking card and opens a new one — and (b) the new
 * card's header label. Related tool calls between two beginTask calls are
 * grouped under that label.
 */
export const beginTaskTool = tool({
	description:
		"Announce the start of a distinct subtask. Call BEFORE the tool calls of each new task (e.g. 'Search flights', 'Search hotels'). Give a short imperative label (3-6 words). Batch all tool calls of the SAME task together between beginTask calls; do NOT call it again for related calls.",
	inputSchema: z.object({
		label: z
			.string()
			.min(1)
			.max(80)
			.describe("Short task label for the step card header, e.g. 'Searching flights'."),
		description: z
			.string()
			.max(300)
			.optional()
			.describe("One line on what this task will do / why."),
	}),
	execute: async (): Promise<{ ok: true }> => ({ ok: true }),
});
