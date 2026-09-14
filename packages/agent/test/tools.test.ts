import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	browserSessionList,
	crawlSiteTool,
	mapSiteTool,
	researchTopicTool,
	scrapeBatchTool,
	scrapeUrlTool,
	searchWebTool,
	wireDiscoverTool,
} from "../src/tools/index";
import type { ToolContext } from "../src/tools/context";

const context: ToolContext = {
	userId: "00000000-0000-0000-0000-000000000000",
	threadId: "thd_test",
	workspaceId: "wsp_test",
	anakinKey: null,
	mem0Key: null,
};

const execOpts = { toolCallId: "tc1", messages: [], context } as never as Parameters<typeof scrapeUrlTool.execute>[1];

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("tool context gating", () => {
	it("crawlSite keyless returns ANAKIN_KEY_REQUIRED (not Zero Touch)", async () => {
		const result = await crawlSiteTool.execute!(
			{ url: "https://example.com" },
			execOpts,
		);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "ANAKIN_KEY_REQUIRED" },
		});
	});

	it("researchTopic keyless returns ANAKIN_KEY_REQUIRED", async () => {
		const result = await researchTopicTool.execute!(
			{ prompt: "quantum computing" },
			execOpts,
		);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "ANAKIN_KEY_REQUIRED" },
		});
	});
});

describe("scrapeBatch schema", () => {
	it("rejects 11 URLs", () => {
		const urls = Array.from({ length: 11 }, (_, i) => `https://x.com/${i}`);
		expect(() => (scrapeBatchTool.inputSchema as unknown as { parse: (v: unknown) => unknown }).parse({ urls })).toThrow();
	});

	it("accepts 1–10 URLs", () => {
		const one = (scrapeBatchTool.inputSchema as unknown as { parse: (v: unknown) => unknown }).parse({ urls: ["https://x.com"] });
		expect((one as { urls: string[] }).urls).toHaveLength(1);
		const ten = (scrapeBatchTool.inputSchema as unknown as { parse: (v: unknown) => unknown }).parse({
			urls: Array.from({ length: 10 }, (_, i) => `https://x.com/${i}`),
		});
		expect((ten as { urls: string[] }).urls).toHaveLength(10);
	});
});

describe("scrapeUrl (Zero Touch — keyless)", () => {
	it("posts to the inline endpoint without an API key and returns the document", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					id: "job_1",
					status: "completed",
					url: "https://example.com",
					markdown: "# hi",
					cached: false,
					durationMs: 300,
				}),
				{ status: 200 },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await scrapeUrlTool.execute!(
			{ url: "https://example.com" },
			execOpts,
		);

		expect(result).toMatchObject({ ok: true, document: { id: "job_1" } });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/url-scraper/scrape");
		const headers = new Headers(init.headers);
		expect(headers.get("X-API-Key")).toBeNull();
	});

	it("falls back to polling on 202 (same id, terminal status)", async () => {
		const inline = new Response(
			JSON.stringify({ id: "job_9", status: "processing", url: "https://example.com" }),
			{ status: 202 },
		);
		const polled = new Response(
			JSON.stringify({
				id: "job_9",
				status: "completed",
				url: "https://example.com",
				markdown: "# done",
				cached: false,
				durationMs: 1200,
			}),
			{ status: 200 },
		);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(inline)
			.mockResolvedValue(polled);
		vi.stubGlobal("fetch", fetchMock);

		const result = await scrapeUrlTool.execute!(
			{ url: "https://example.com" },
			execOpts,
		);

		expect(result).toMatchObject({ ok: true, document: { status: "completed" } });
		const pollUrl = fetchMock.mock.calls[1]?.[0] as string;
		expect(pollUrl).toContain("/v1/url-scraper/job_9");
	});
});

describe("wireDiscover (public, keyless)", () => {
	it("passes query params and returns matched actions", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [
						{
							action_id: "ab_search_listings",
							catalog_slug: "airbnb",
							name: "Search Listings",
							description: "Search Airbnb listings.",
							auth_mode: "none",
							params: [{ name: "query", type: "string", required: true }],
							credits: 1,
						},
					],
				}),
				{ status: 200 },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await wireDiscoverTool.execute!({ q: "search airbnb" }, execOpts);

		expect(result).toMatchObject({
			ok: true,
			actions: [{ action_id: "ab_search_listings" }],
		});
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/wire/resolve");
		expect(url).toContain("q=search+airbnb");
		expect(new Headers(init.headers).get("X-API-Key")).toBeNull();
	});
});

describe("keyed tools", () => {
	it("searchWeb with a key sends X-API-Key", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({ id: "s1", results: [{ url: "https://a.com", title: "A" }] }),
				{ status: 200 },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await searchWebTool.execute!(
			{ prompt: "best laptops 2026" },
			{ ...execOpts, context: { ...context, anakinKey: "ak_test" } } as never,
		);

		expect(result).toMatchObject({ ok: true });
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(new Headers(init.headers).get("X-API-Key")).toBe("ak_test");
	});

	it("browserSessionList keyless returns ANAKIN_KEY_REQUIRED", async () => {
		const result = await browserSessionList.execute!({}, execOpts);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "ANAKIN_KEY_REQUIRED" },
		});
	});
});

describe("country validation", () => {
	it("mapSite has no country param (API doesn't support it)", () => {
		// Map API has no geography parameter — verify the schema strips unknown keys.
		const parsed = (mapSiteTool.inputSchema as unknown as { parse: (v: unknown) => unknown }).parse({
			url: "https://example.com",
			country: "usa",
		});
		expect("country" in (parsed as Record<string, unknown>)).toBe(false);
	});

	it("crawlSite rejects a 3-letter country", () => {
		expect(() =>
			(crawlSiteTool.inputSchema as unknown as { parse: (v: unknown) => unknown }).parse({ url: "https://example.com", country: "usa" }),
		).toThrow();
	});
});
