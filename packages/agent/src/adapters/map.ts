export interface MapResult {
	id: string;
	url: string;
	links: string[];
	totalLinks: number;
	externalLinks: string[];
	totalExternalLinks: number;
	durationMs: number;
}

export interface MapAdapter {
	readonly name: string;
	map(
		url: string,
		options?: {
			limit?: number;
			depth?: number;
			limitPerLevel?: number;
			includeSubdomains?: boolean;
			includeExternalLinks?: boolean;
			search?: string;
			useBrowser?: boolean;
			sessionId?: string;
		},
	): Promise<MapResult>;
}
