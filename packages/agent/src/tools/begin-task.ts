import { tool } from "ai";
import { z } from "zod";

export const beginTaskTool = tool({
	description:
		"Announce the start of a distinct subtask. Call BEFORE the tool calls of each new task (e.g. 'Search flights', 'Search hotels'). Give a short imperative label (3-6 words). Batch all tool calls of the SAME task together between beginTask calls; do NOT call it again for related calls.",
	inputSchema: z.object({
		label: z
			.string()
			.min(1)
			.max(80)
			.describe(
				"Short task label for the step card header, e.g. 'Searching flights'.",
			),
		description: z
			.string()
			.max(300)
			.optional()
			.describe("One line on what this task will do / why."),
	}),
	execute: async (): Promise<{ ok: true }> => ({ ok: true }),
});
