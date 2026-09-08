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
			includeSubdomains?: boolean;
			includeExternalLinks?: boolean;
		},
	): Promise<MapResult> {
		const result = await this.client.map(url, {
			limit: options?.limit,
			depth: options?.depth,
			includeSubdomains: options?.includeSubdomains,
			includeExternalLinks: options?.includeExternalLinks,
		});
		return {
			id: result.id,
			url: result.url,
			links: result.links,
			totalLinks: result.totalLinks,
			externalLinks: result.externalLinks,
			totalExternalLinks: result.totalExternalLinks,
		};
	}
}
