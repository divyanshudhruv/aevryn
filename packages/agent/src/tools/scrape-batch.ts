import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	isValidCountry,
	mapAnakinError,
	type ToolResult,
} from "./anakin-client";
import type { InlineDocument } from "./scrape-url";

const inputSchema = z.object({
	urls: z
		.array(z.string().url())
		.min(1)
		.max(10)
		.describe("1–10 URLs, scraped in parallel."),
	country: z.string().length(2).optional().describe("ISO-2 proxy country."),
	useBrowser: z.boolean().optional().describe("Headless Chrome for JS-heavy sites."),
	generateJson: z.boolean().optional().describe("AI-extract structured JSON."),
	sessionId: z.string().optional().describe("Browser session id for authenticated pages."),
});

export const scrapeBatchTool = tool({
	description:
		"Scrape 2–10 URLs in parallel (1 credit per URL, one rate-limit slot). Requires an Anakin API key. Returns per-URL documents including each one's status and error if it failed individually.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ documents: InlineDocument[] }>> => {
		if (!context.anakinKey) {
			return {
				ok: false,
				error: {
					code: "ANAKIN_KEY_REQUIRED",
					message:
						"Batch scraping needs your Anakin API key (Settings → BYOK). A single page works keyless via scrapeUrl.",
				},
			};
		}
		try {
			if (input.country && !(await isValidCountry(input.country))) {
				return {
					ok: false,
					error: {
						code: "INVALID_COUNTRY",
						message: `Country '${input.country}' is not supported by Anakin.`,
					},
				};
			}

			// The SDK exposes single-URL scrape only; batch is the async endpoint
			// POST /v1/url-scraper/batch polled at /v1/url-scraper/{id} (same
			// job-status shape). Batch in ONE rate-limit slot is the whole point,
			// so submit raw rather than fanning out client.scrape() per URL.
			const submitted = await fetch("https://api.anakin.io/v1/url-scraper/batch", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": context.anakinKey,
				},
				body: JSON.stringify({
					urls: input.urls,
					country: input.country ?? "us",
					useBrowser: input.useBrowser ?? false,
					generateJson: input.generateJson ?? false,
					...(input.sessionId ? { sessionId: input.sessionId } : {}),
				}),
				signal: AbortSignal.timeout(30_000),
			});
			if (!submitted.ok) {
				const errBody = (await submitted.json().catch(() => ({}))) as Record<string, unknown>;
				throw Object.assign(
					new Error(
						typeof errBody.message === "string"
							? errBody.message
							: `Batch submit failed (${submitted.status})`,
					),
					{ statusCode: submitted.status, body: errBody },
				);
			}
			const { jobId } = (await submitted.json()) as { jobId: string };

			// Poll the shared job endpoint until terminal (batch parent settles
			// when every child settles; partial failures don't fail the parent).
			const result = (await pollBatchJob(
				context.anakinKey,
				jobId,
			)) as { results?: InlineDocument[] } & InlineDocument;

			const documents = result.results ?? [result];
			return { ok: true, documents };
		} catch (err) {
			return mapAnakinError(err) as ToolResult<{ documents: InlineDocument[] }>;
		}
	},
});

async function pollBatchJob(
	apiKey: string,
	jobId: string,
	maxAttempts = 90,
): Promise<unknown> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const response = await fetch(`https://api.anakin.io/v1/url-scraper/${jobId}`, {
			headers: { "X-API-Key": apiKey },
		});
		const body = (await response.json()) as { status?: string };
		if (body.status === "completed" || body.status === "failed") return body;
		await new Promise((resolve) => setTimeout(resolve, 2_500));
	}
	throw new Error(`Batch job ${jobId} did not settle within the poll window.`);
}
