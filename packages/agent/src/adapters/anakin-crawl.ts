import { Anakin } from "@anakin-io/sdk";

import type { CrawlAdapter, CrawlResult } from "./crawl";

export class AnakinCrawlAdapter implements CrawlAdapter {
	readonly name = "anakin-crawl";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async crawl(
		url: string,
		options?: {
			maxPages?: number;
			depth?: number;
			includePatterns?: string[];
			excludePatterns?: string[];
			country?: string;
			useBrowser?: boolean;
		},
	): Promise<CrawlResult> {
		const result = await this.client.crawl(url, {
			maxPages: options?.maxPages,
			depth: options?.depth,
			includePatterns: options?.includePatterns,
			excludePatterns: options?.excludePatterns,
			country: options?.country,
			useBrowser: options?.useBrowser,
		});
		return {
			id: result.id,
			url: result.url,
			totalPages: result.totalPages,
			completedPages: result.completedPages,
			pages: result.pages.map((page) => ({
				url: page.url,
				markdown: page.markdown,
				error: page.error,
			})),
		};
	}
}
