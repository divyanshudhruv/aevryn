import { Anakin } from "@anakin-io/sdk";

import type { ResearchAdapter, ResearchResult } from "./research";

export class AnakinResearchAdapter implements ResearchAdapter {
	readonly name = "anakin-research";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async research(
		prompt: string,
		options?: {
			useBrowser?: boolean;
			schema?: Record<string, unknown>;
		},
	): Promise<ResearchResult> {
		const result = await this.client.agenticSearch(prompt, {
			useBrowser: options?.useBrowser,
			schema: options?.schema,
		});
		return {
			id: result.id,
			status: result.status,
			jobType: result.jobType,
			summary: result.generatedJson?.summary,
			structuredData: result.generatedJson?.structured_data,
			dataSchema: result.generatedJson?.data_schema,
			cached: result.cached,
			createdAt: result.createdAt,
			completedAt: result.completedAt,
			durationMs: result.durationMs,
			error: result.error,
		};
	}
}
