import { Anakin } from "@anakin-io/sdk";

import type { SearchAdapter, SearchResult } from "./search";

export class AnakinSearchAdapter implements SearchAdapter {
	readonly name = "anakin-search";
	private readonly client: Anakin;

	constructor(client?: Anakin) {
		this.client =
			client ??
			new Anakin({
				apiKey: process.env.ANAKIN_API_KEY,
				baseUrl: process.env.ANAKIN_BASE_URL,
			});
	}

	async search(
		query: string,
		options?: { limit?: number },
	): Promise<SearchResult> {
		const result = await this.client.search(query, {
			limit: options?.limit,
		});
		return {
			id: result.id,
			results: result.results.map((item) => ({
				url: item.url,
				title: item.title,
				snippet: item.snippet,
				date: item.date,
				lastUpdated: item.lastUpdated,
			})),
		};
	}
}
