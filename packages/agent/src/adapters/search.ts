export interface SearchResultItem {
	url: string;
	title?: string;
	snippet?: string;
	date?: string;
	lastUpdated?: string;
}

export interface SearchResult {
	id: string;
	results: SearchResultItem[];
}

export interface SearchAdapter {
	readonly name: string;
	search(query: string, options?: { limit?: number }): Promise<SearchResult>;
}
