import type { TerminalStatus } from "./scrape";

export interface ResearchResult {
	id: string;
	status: TerminalStatus;
	jobType: string;
	summary?: string;
	structuredData?: Record<string, unknown>;
	dataSchema?: Record<string, unknown>;
	cached: boolean;
	createdAt?: string;
	completedAt?: string;
	durationMs: number;
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
