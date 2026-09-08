import { Anakin } from "@anakin-io/sdk";

import type { MapAdapter, MapResult } from "./map";

export class AnakinMapAdapter implements MapAdapter {
	readonly name = "anakin-map";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async map(
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
	): Promise<MapResult> {
		const result = await this.client.map(url, {
			limit: options?.limit,
			depth: options?.depth,
			limitPerLevel: options?.limitPerLevel,
			includeSubdomains: options?.includeSubdomains,
			includeExternalLinks: options?.includeExternalLinks,
			search: options?.search,
			useBrowser: options?.useBrowser,
			sessionId: options?.sessionId,
		});
		return {
			id: result.id,
			url: result.url,
			links: result.links,
			totalLinks: result.totalLinks,
			externalLinks: result.externalLinks,
			totalExternalLinks: result.totalExternalLinks,
			durationMs: result.durationMs,
		};
	}
}
