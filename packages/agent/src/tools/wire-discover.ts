import { tool } from "ai";
import { z } from "zod";
import { anakinGet, type ToolResult } from "./anakin-client";
import { toolContextSchema } from "./context";

export interface DiscoveredAction {
	action_id: string;
	catalog_slug?: string;
	catalog_name?: string;
	name?: string;
	description?: string;
	mode?: string;
	auth_mode?: string;
	auth_required?: boolean;
	connected?: boolean;
	params?: Array<{
		name: string;
		type?: string;
		required?: boolean;
		default?: unknown;
	}>;
	credits?: number;
}

const inputSchema = z.object({
	q: z
		.string()
		.optional()
		.describe("Intent, e.g. 'search airbnb listings', 'post a tweet'."),
	catalog: z.string().optional(),
	category: z.string().optional(),
	authMode: z.enum(["none", "optional", "required"]).optional(),
});

export const wireDiscoverTool = tool({
	description:
		"Find ready-made Wire actions. 940+ sites: search, extract, post, … Free, keyless. Returns action_ids with param schemas, credit costs. Call before any site task. Execute with wireAction.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
	): Promise<ToolResult<{ actions: DiscoveredAction[] }>> => {
		try {
			const params: Record<string, string> = {};
			if (input.q) params.q = input.q;
			if (input.catalog) params.catalog = input.catalog;
			if (input.category) params.category = input.category;
			if (input.authMode) params.auth_mode = input.authMode;

			const { body } = await anakinGet<{ results?: DiscoveredAction[] }>(
				"/wire/resolve",
				Object.keys(params).length > 0 ? params : undefined,
				null, // public — no key
			);
			return { ok: true, actions: body.results ?? [] };
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "DISCOVERY_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});
