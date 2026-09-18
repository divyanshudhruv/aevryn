import type { BrowserSession } from "@anakin-io/sdk";
import { tool } from "ai";
import { z } from "zod";
import {
	anakinClient,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import { type ToolContext, toolContextSchema } from "./context";

export const browserSessionList = tool({
	description:
		"List saved Anakin browser sessions. Logged-in profiles for authenticated scraping. Needs API key. Free.",
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
		"Start browser session for a site. User logs in via Anakin dashboard (noVNC). Reuse sessionId in scrapeUrl/scrapeBatch/crawlSite. Needs API key.",
	inputSchema: z.object({
		websiteUrl: z.string().url(),
		name: z
			.string()
			.min(1)
			.describe("A recognizable name, e.g. 'My LinkedIn'."),
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
	description: "Rename a saved browser session. Needs API key. Free.",
	inputSchema: z.object({
		id: z.string().min(1),
		name: z.string().min(1),
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
		"Delete a saved browser session. Stored login destroyed. Needs API key. Free.",
	inputSchema: z.object({
		id: z.string().min(1),
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
