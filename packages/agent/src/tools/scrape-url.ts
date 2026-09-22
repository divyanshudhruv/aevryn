import { tool } from "ai";
import { z } from "zod";

import { checkExternalUrl } from "../ssrf-guard";
import { wrapUntrustedJson, wrapUntrustedMaybe } from "../untrusted";
import {
	anakinGet,
	anakinPost,
	isValidCountry,
	type ToolResult,
} from "./anakin-client";
import { toolContextSchema } from "./context";

export type { ToolContext } from "./context";

const SCRAPE_FORMATS = [
	"markdown",
	"html",
	"cleanedHtml",
	"json",
	"links",
	"images",
	"screenshot",
	"screenshotFullPage",
	"summary",
] as const;

export type ScrapeStatus =
	| "pending"
	| "queued"
	| "processing"
	| "completed"
	| "failed";

export interface InlineDocument {
	id: string;
	status: ScrapeStatus;
	url: string;
	jobType?: "url_scraper" | "batch_url_scraper";
	country?: string;
	markdown?: string;
	html?: string;
	cleanedHtml?: string;
	generatedJson?: Record<string, unknown>;
	links?: Array<{ href: string; text?: string }>;
	images?: Array<{ src: string; alt?: string }>;
	summary?: string;
	screenshotUrl?: string;
	fullPageScreenshotUrl?: string;
	cached?: boolean;
	error?: string | null;
	durationMs?: number;
	createdAt?: string;
	completedAt?: string;
}

export interface BatchDocument extends Omit<InlineDocument, "jobType"> {
	index: number;
	jobType?: "batch_url_scraper";
}

interface ScrapeBody extends Record<string, unknown> {
	url: string;
	formats?: string[];
	country?: string;
	useBrowser?: boolean;
	generateJson?: boolean;
	outputSchema?: Record<string, unknown>;
	forceFresh?: boolean;
	sessionId?: string;
}

const inputSchema = z.object({
	url: z.string().url(),
	formats: z
		.array(z.enum(SCRAPE_FORMATS))
		.max(9)
		.optional()
		.describe("Default: markdown + html + cleanedHtml."),
	useBrowser: z
		.boolean()
		.optional()
		.describe("Headless Chrome for JS-heavy sites (default false)."),
	outputSchema: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"JSON Schema of fields to AI-extract (+2 credits, implies generateJson).",
		),
	country: z
		.string()
		.length(2)
		.optional()
		.describe("ISO-2 proxy country, e.g. 'us', 'in'."),
	forceFresh: z
		.boolean()
		.optional()
		.describe("Skip the 24h cache (results are otherwise free when cached)."),
	sessionId: z
		.string()
		.optional()
		.describe("Browser session id for authenticated pages."),
});

function untrustedDocument(document: InlineDocument): InlineDocument {
	return {
		...document,
		markdown: wrapUntrustedMaybe(document.markdown),
		html: wrapUntrustedMaybe(document.html),
		cleanedHtml: wrapUntrustedMaybe(document.cleanedHtml),
		summary: wrapUntrustedMaybe(document.summary),
		generatedJson: document.generatedJson
			? { _untrusted: wrapUntrustedJson(document.generatedJson) }
			: undefined,
		links: document.links?.map((l) => ({
			href: l.href,
			text: wrapUntrustedMaybe(l.text),
		})),
		images: document.images?.map((i) => ({
			src: i.src,
			alt: wrapUntrustedMaybe(i.alt),
		})),
	};
}

export const scrapeUrlTool = tool({
	description:
		"Scrape one page inline. Returns markdown + html + cleanedHtml by default. Keyless. 1 credit (2 with JSON extraction). Free if cached <24h unless forceFresh. 2–10 pages: scrapeBatch. Whole site: crawlSite. URLs only: mapSite.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context },
	): Promise<ToolResult<{ document: InlineDocument }>> => {
		try {
			const urlVerdict = checkExternalUrl(input.url);
			if (urlVerdict.blocked) {
				return {
					ok: false,
					error: {
						code: "URL_BLOCKED",
						message: `Cannot scrape '${input.url}': ${urlVerdict.reason}`,
					},
				};
			}

			if (
				input.country &&
				!(await isValidCountry(input.country, context.anakinKey))
			) {
				return {
					ok: false,
					error: {
						code: "INVALID_COUNTRY",
						message: `Country '${input.country}' is not in Anakin's supported list.`,
					},
				};
			}

			const body: ScrapeBody = {
				url: input.url,
				formats: input.formats ?? ["markdown", "html", "cleanedHtml"],
				useBrowser: input.useBrowser ?? false,
			};
			if (input.country) body.country = input.country;
			if (input.outputSchema) {
				body.outputSchema = input.outputSchema;
				body.generateJson = true;
			}
			if (input.forceFresh != null) body.forceFresh = input.forceFresh;
			if (input.sessionId) body.sessionId = input.sessionId;

			const { status, body: document } = await anakinPost<InlineDocument>(
				"/url-scraper/scrape",
				body,
				context.anakinKey,
				120_000,
			);

			if (status === 202 || !isTerminal(document.status)) {
				const polled = await pollScrapeJob(document.id, context.anakinKey);
				return { ok: true, document: untrustedDocument(polled) };
			}

			return { ok: true, document: untrustedDocument(document) };
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "SCRAPE_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});

function isTerminal(status: string): boolean {
	return status === "completed" || status === "failed";
}

async function pollScrapeJob(
	jobId: string,
	apiKey: string | null,
	maxAttempts = 90,
): Promise<InlineDocument> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const { body } = await anakinGet<InlineDocument>(
			`/url-scraper/${jobId}`,
			undefined,
			apiKey,
			15_000,
		);
		if (isTerminal(body.status)) return body;
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	}
	throw new Error(`Scrape job ${jobId} did not settle within the poll window.`);
}
