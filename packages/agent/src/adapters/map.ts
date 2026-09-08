export interface MapResult {
	id: string;
	url: string;
	links: string[];
	totalLinks: number;
	externalLinks: string[];
	totalExternalLinks: number;
}

export interface MapAdapter {
	readonly name: string;
	map(
		url: string,
		options?: {
			limit?: number;
			depth?: number;
			includeSubdomains?: boolean;
			includeExternalLinks?: boolean;
		},
	): Promise<MapResult>;
}
