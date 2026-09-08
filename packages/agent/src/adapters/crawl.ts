export interface CrawlPage {
	url: string;
	markdown?: string;
	error?: string;
}

export interface CrawlResult {
	id: string;
	url: string;
	totalPages: number;
	completedPages: number;
	pages: CrawlPage[];
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
		},
	): Promise<CrawlResult>;
}
