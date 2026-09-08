export interface ResearchResult {
	id: string;
	summary?: string;
	structuredData?: Record<string, unknown>;
	dataSchema?: Record<string, unknown>;
	error?: string;
}

export interface ResearchAdapter {
	readonly name: string;
	research(
		prompt: string,
		options?: {
			useBrowser?: boolean;
			schema?: Record<string, unknown>;
		},
	): Promise<ResearchResult>;
}
