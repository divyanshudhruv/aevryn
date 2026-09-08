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
		},
	): Promise<ScrapeResult> {
		const doc = await this.client.scrape(url, {
			formats: options?.formats,
			country: options?.country,
			useBrowser: options?.useBrowser,
			generateJson: options?.generateJson,
		});
		return {
			id: doc.id,
			url: doc.url,
			cached: doc.cached,
			markdown: doc.markdown,
			html: doc.html,
			cleanedHtml: doc.cleanedHtml,
			links: doc.links,
			images: doc.images,
			summary: doc.summary,
			generatedJson: doc.generatedJson,
			screenshotUrl: doc.screenshotUrl ?? doc.fullPageScreenshotUrl,
			error: doc.error,
		};
	}
}
