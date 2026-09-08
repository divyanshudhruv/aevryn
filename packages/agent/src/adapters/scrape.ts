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

export type TerminalStatus = "completed" | "failed";

export interface ScrapeResult {
	id: string;
	url: string;
	status: TerminalStatus;
	cached: boolean;
	durationMs: number;
	createdAt?: string;
	completedAt?: string;
	markdown?: string;
	html?: string;
	cleanedHtml?: string;
	links?: string[];
	images?: string[];
	summary?: string;
	generatedJson?: Record<string, unknown>;
	screenshotUrl?: string;
	fullPageScreenshotUrl?: string;
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
			forceFresh?: boolean;
			sessionId?: string;
			sessionName?: string;
		},
	): Promise<ScrapeResult>;
}
