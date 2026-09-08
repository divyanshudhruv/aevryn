import { Anakin, type ScrapeFormat } from "@anakin-io/sdk";

import type { ScrapeAdapter, ScrapeResult } from "./scrape";

export class AnakinScrapeAdapter implements ScrapeAdapter {
	readonly name = "anakin-scrape";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async scrape(
		url: string,
		options?: {
			formats?: ScrapeFormat[];
			country?: string;
			useBrowser?: boolean;
			generateJson?: boolean;
			forceFresh?: boolean;
			sessionId?: string;
			sessionName?: string;
		},
	): Promise<ScrapeResult> {
		const doc = await this.client.scrape(url, {
			formats: options?.formats,
			country: options?.country,
			useBrowser: options?.useBrowser,
			generateJson: options?.generateJson,
			forceFresh: options?.forceFresh,
			sessionId: options?.sessionId,
			sessionName: options?.sessionName,
		});
		return {
			id: doc.id,
			url: doc.url,
			status: doc.status,
			cached: doc.cached,
			durationMs: doc.durationMs,
			createdAt: doc.createdAt,
			completedAt: doc.completedAt,
			markdown: doc.markdown,
			html: doc.html,
			cleanedHtml: doc.cleanedHtml,
			links: doc.links,
			images: doc.images,
			summary: doc.summary,
			generatedJson: doc.generatedJson,
			screenshotUrl: doc.screenshotUrl,
			fullPageScreenshotUrl: doc.fullPageScreenshotUrl,
			error: doc.error,
		};
	}
}
