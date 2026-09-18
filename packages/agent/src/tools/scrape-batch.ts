import { tool } from "ai";
import { z } from "zod";

import { checkExternalUrl } from "../ssrf-guard";
import { wrapUntrustedJson, wrapUntrustedMaybe } from "../untrusted";
import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinGet,
	anakinPost,
	isValidCountry,
	mapAnakinError,
	type ToolResult,
} from "./anakin-client";
import type { BatchDocument } from "./scrape-url";

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
		"Scrape 2–10 URLs in parallel. 1 credit/URL, one rate slot. Needs API key. Returns per-URL docs: index, status, per-item error.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ documents: BatchDocument[] }>> => {
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
			for (const url of input.urls) {
				const urlVerdict = checkExternalUrl(url);
				if (urlVerdict.blocked) {
					return {
						ok: false,
						error: {
							code: "URL_BLOCKED",
							message: `Cannot scrape '${url}': ${urlVerdict.reason}`,
						},
					};
				}
			}

			if (input.country && !(await isValidCountry(input.country, context.anakinKey))) {
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
			const { status, body: submitted } = await anakinPost<{ jobId?: string; status?: string }>(
				"/url-scraper/batch",
				{
					urls: input.urls,
					country: input.country ?? "us",
					useBrowser: input.useBrowser ?? false,
					generateJson: input.generateJson ?? false,
					...(input.sessionId ? { sessionId: input.sessionId } : {}),
				},
				context.anakinKey,
				30_000,
			);
			if (status !== 202 && status !== 200) {
				const errBody = submitted as Record<string, unknown>;
				throw Object.assign(
					new Error(
						typeof errBody.message === "string"
							? errBody.message
							: `Batch submit failed (${status})`,
					),
					{ statusCode: status, body: errBody },
				);
			}
			const jobId = submitted.jobId;
			if (typeof jobId !== "string" || jobId.length === 0) {
				throw new Error("Batch submit did not return a jobId.");
			}

			// Poll the shared job endpoint until terminal (batch parent settles
			// when every child settles; partial failures don't fail the parent).
			const result = await pollBatchJob<BatchDocument & { results?: BatchDocument[] }>(
				`/url-scraper/${jobId}`,
				context.anakinKey,
			);

			const documents = result.results ?? [{ ...result, index: 0 }];
			return {
				ok: true,
				documents: documents.map((doc) => ({
					...doc,
					markdown: wrapUntrustedMaybe(doc.markdown),
					html: wrapUntrustedMaybe(doc.html),
					cleanedHtml: wrapUntrustedMaybe(doc.cleanedHtml),
					summary: wrapUntrustedMaybe(doc.summary),
					generatedJson: doc.generatedJson
						? { _untrusted: wrapUntrustedJson(doc.generatedJson) }
						: undefined,
				})),
			};
		} catch (err) {
			return mapAnakinError(err) as ToolResult<{ documents: BatchDocument[] }>;
		}
	},
});

async function pollBatchJob<T extends { status?: string }>(
	path: string,
	apiKey: string,
	maxAttempts = 90,
): Promise<T> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const { body } = await anakinGet<T>(path, undefined, apiKey);
		if (body.status === "completed" || body.status === "failed") return body;
		await new Promise((resolve) => setTimeout(resolve, 2_500));
	}
	throw new Error(`Batch job did not settle within the poll window.`);
}
