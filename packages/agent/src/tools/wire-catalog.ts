import { tool } from "ai";
import { z } from "zod";
import {
	anakinGet,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import { type ToolContext, toolContextSchema } from "./context";

export interface CatalogEntry {
	id?: string;
	slug: string;
	name?: string;
	domain?: string;
	category?: string;
	description?: string;
	authRequired?: boolean;
	authTypes?: string[];
	status?: string;
	actionCount?: number;
}

export interface CatalogAction {
	actionId?: string;
	name?: string;
	description?: string;
	type?: string;
	mode?: string;
	authMode?: string;
	parameters?: Array<{
		name: string;
		type?: string;
		required?: boolean;
		default?: unknown;
		description?: string;
	}>;
	creditsPerCall?: number;
	status?: string;
}

interface ApiCatalogEntry extends Record<string, unknown> {
	id?: unknown;
	slug?: unknown;
	name?: unknown;
	domain?: unknown;
	category?: unknown;
	description?: unknown;
	auth_required?: unknown;
	auth_types?: unknown;
	status?: unknown;
	action_count?: unknown;
}

interface ApiCatalogAction extends Record<string, unknown> {
	action_id?: unknown;
	name?: unknown;
	description?: unknown;
	type?: unknown;
	mode?: unknown;
	auth_mode?: unknown;
	parameters?: unknown;
	credits_per_call?: unknown;
	status?: unknown;
}

function mapEntry(entry: ApiCatalogEntry): CatalogEntry {
	return {
		id: typeof entry.id === "string" ? entry.id : undefined,
		slug: typeof entry.slug === "string" ? entry.slug : "unknown",
		name: typeof entry.name === "string" ? entry.name : undefined,
		domain: typeof entry.domain === "string" ? entry.domain : undefined,
		category: typeof entry.category === "string" ? entry.category : undefined,
		description:
			typeof entry.description === "string" ? entry.description : undefined,
		authRequired:
			typeof entry.auth_required === "boolean"
				? entry.auth_required
				: undefined,
		authTypes: Array.isArray(entry.auth_types)
			? entry.auth_types.filter((t): t is string => typeof t === "string")
			: undefined,
		status: typeof entry.status === "string" ? entry.status : undefined,
		actionCount:
			typeof entry.action_count === "number" ? entry.action_count : undefined,
	};
}

function mapAction(action: ApiCatalogAction): CatalogAction {
	return {
		actionId:
			typeof action.action_id === "string" ? action.action_id : undefined,
		name: typeof action.name === "string" ? action.name : undefined,
		description:
			typeof action.description === "string" ? action.description : undefined,
		type: typeof action.type === "string" ? action.type : undefined,
		mode: typeof action.mode === "string" ? action.mode : undefined,
		authMode:
			typeof action.auth_mode === "string" ? action.auth_mode : undefined,
		parameters: Array.isArray(action.parameters)
			? (action.parameters as Array<Record<string, unknown>>)
					.filter(
						(p) =>
							p != null && typeof p === "object" && typeof p.name === "string",
					)
					.map((p) => ({
						name: p.name as string,
						type: typeof p.type === "string" ? p.type : undefined,
						required: typeof p.required === "boolean" ? p.required : undefined,
						default: p.default,
						description:
							typeof p.description === "string" ? p.description : undefined,
					}))
			: undefined,
		creditsPerCall:
			typeof action.credits_per_call === "number"
				? action.credits_per_call
				: undefined,
		status: typeof action.status === "string" ? action.status : undefined,
	};
}

const inputSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe(
			"Catalog slug for full detail (all actions with parameter schemas, mode, credit costs). Omit to list all catalogs.",
		),
	scope: z
		.enum(["all", "my", "global"])
		.optional()
		.describe(
			"List filter: my catalogs (with your actions), global public ones, or all (default).",
		),
});

export const wireCatalogTool = tool({
	description:
		"Browse Wire catalog. No slug: list sites with actions (name, domain, category, auth, action count). With slug: full detail — action_id, param schema, mode, auth_mode, credits_per_call. Needs API key. Use between wireDiscover, wireAction when schema unclear.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<
			| { catalog: CatalogEntry[] }
			| { catalog: CatalogEntry; actions: CatalogAction[] }
		>
	> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			if (input.slug) {
				const { body } = await anakinGet<{
					catalog?: ApiCatalogEntry;
					actions?: ApiCatalogAction[];
				}>(
					`/wire/catalog/${encodeURIComponent(input.slug)}`,
					undefined,
					key.apiKey,
				);
				if (!body.catalog || typeof body.catalog.slug !== "string") {
					return {
						ok: false,
						error: {
							code: "NOT_FOUND",
							message: `Wire catalog '${input.slug}' was not found.`,
						},
					};
				}
				return {
					ok: true,
					catalog: mapEntry(body.catalog),
					actions: (body.actions ?? []).map(mapAction),
				};
			}

			const params: Record<string, string> | undefined =
				input.scope && input.scope !== "all"
					? { scope: input.scope }
					: undefined;
			const { body } = await anakinGet<{ catalog?: ApiCatalogEntry[] }>(
				"/wire/catalog",
				params,
				key.apiKey,
			);
			return {
				ok: true,
				catalog: (body.catalog ?? []).map(mapEntry),
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
