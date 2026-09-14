import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinClient,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import type { BrowserSession } from "@anakin-io/sdk";


export const browserSessionList = tool({
	description:
		"List your saved Anakin browser sessions (logged-in profiles usable for authenticated scraping). Requires an API key. Free.",
	inputSchema: z.object({
		domain: z.string().optional().describe("Filter by website domain."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			sessions: Array<{
				id: string;
				name?: string;
				websiteDomain?: string;
				isActive: boolean;
				expiresAt?: string;
			}>;
		}>
	> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const client = anakinClient(key.apiKey);
			const sessions: BrowserSession[] = await client.sessions.list({
				domain: input.domain,
			});
			return {
				ok: true,
				sessions: sessions.map((s) => ({
					id: s.id,
					name: s.name,
					websiteDomain: s.websiteDomain,
					isActive: s.isActive,
					expiresAt: s.expiresAt,
				})),
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});

export const browserSessionCreate = tool({
	description:
		"Start a new browser session for a website. The user completes the login in Anakin's dashboard (noVNC window); the session can then be reused via its sessionId in scrapeUrl/scrapeBatch/crawlSite. Requires an API key.",
	inputSchema: z.object({
		websiteUrl: z.string().url().describe("The site to log into."),
		name: z.string().min(1).describe("A recognizable name, e.g. 'My LinkedIn'."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			sessionId: string;
			novncUrl?: string;
			expiresIn?: number;
		}>
	> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const client = anakinClient(key.apiKey);
			const handle = await client.sessions.create({
				websiteUrl: input.websiteUrl,
				name: input.name,
			});
			return {
				ok: true,
				sessionId: handle.sessionId,
				novncUrl: handle.novncUrl,
				expiresIn: handle.expiresIn,
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});

export const browserSessionRename = tool({
	description:
		"Rename a saved browser session. Requires an API key. Free.",
	inputSchema: z.object({
		id: z.string().min(1).describe("Session id."),
		name: z.string().min(1).describe("New name."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ renamed: true }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const client = anakinClient(key.apiKey);
			await client.sessions.update(input.id, { name: input.name });
			return { ok: true, renamed: true };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});

export const browserSessionDelete = tool({
	description:
		"Delete a saved browser session (its stored login is destroyed). Requires an API key. Free.",
	inputSchema: z.object({
		id: z.string().min(1).describe("Session id."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ deleted: true }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const client = anakinClient(key.apiKey);
			await client.sessions.delete(input.id);
			return { ok: true, deleted: true };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
