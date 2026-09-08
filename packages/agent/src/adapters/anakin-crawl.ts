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
			sessionId?: string;
		},
	): Promise<CrawlResult> {
		const result = await this.client.crawl(url, {
			maxPages: options?.maxPages,
			depth: options?.depth,
			includePatterns: options?.includePatterns,
			excludePatterns: options?.excludePatterns,
			country: options?.country,
			useBrowser: options?.useBrowser,
			sessionId: options?.sessionId,
		});
		return {
			id: result.id,
			url: result.url,
			totalPages: result.totalPages,
			completedPages: result.completedPages,
			pages: result.pages.map((page) => ({
				url: page.url,
				status: page.status,
				markdown: page.markdown,
				html: page.html,
				durationMs: page.durationMs,
				error: page.error,
			})),
			durationMs: result.durationMs,
		};
	}
}
