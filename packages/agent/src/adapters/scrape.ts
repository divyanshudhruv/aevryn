export type ScrapeFormat =
	| "markdown"
	| "html"
	| "cleanedHtml"
	| "json"
	| "links"
	| "images"
	| "screenshot"
	| "screenshotFullPage"
	| "summary";

export interface ScrapeResult {
	id: string;
	url: string;
	cached: boolean;
	markdown?: string;
	html?: string;
	cleanedHtml?: string;
	links?: string[];
	images?: string[];
	summary?: string;
	generatedJson?: Record<string, unknown>;
	screenshotUrl?: string;
	error?: string;
}

export interface ScrapeAdapter {
	readonly name: string;
	scrape(
		url: string,
		options?: {
			formats?: ScrapeFormat[];
			country?: string;
			useBrowser?: boolean;
			generateJson?: boolean;
		},
	): Promise<ScrapeResult>;
}
