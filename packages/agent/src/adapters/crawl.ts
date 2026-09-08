import type { TerminalStatus } from "./scrape";

export interface CrawlPage {
	url: string;
	status: TerminalStatus;
	markdown?: string;
	html?: string;
	durationMs: number;
	error?: string;
}

export interface CrawlResult {
	id: string;
	url: string;
	totalPages: number;
	completedPages: number;
	pages: CrawlPage[];
	durationMs: number;
}

export interface CrawlAdapter {
	readonly name: string;
	crawl(
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
	): Promise<CrawlResult>;
}
