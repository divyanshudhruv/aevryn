import { describe, expect, it } from "vitest";

import { askUserTool, presentPlanTool } from "../src/tools/client";

describe("askUser (client tool)", () => {
	it("has no execute — the client answers it via addToolResult", () => {
		expect(askUserTool.execute).toBeUndefined();
	});

	it("accepts old-workspace question shapes", () => {
		// Mirrors @aevryn/ui AskUserQuestion minus view-only fields
		// (chipPosition, nextLabel, freeTextValidate are render-side only).
		const parsed = (askUserTool.inputSchema as unknown as {
			parse: (v: unknown) => unknown;
		}).parse([
			{
				id: "q1",
				title: "Which provider should I scrape with?",
				options: [
					{ id: "opt1", title: "Fast (default)", description: "Plain fetch" },
					{ id: "opt2", title: "Browser", description: "Headless Chrome" },
				],
				multiSelect: false,
				allowOther: true,
				otherPlaceholder: "Type your own…",
				skippable: true,
				layout: "stacked",
			},
			{
				id: "q2",
				title: "Describe the goal",
				freeText: true,
				freeTextPlaceholder: "e.g. track prices daily",
				freeTextMultiline: true,
			},
		]);
		expect(Array.isArray(parsed)).toBe(true);
	});

	it("rejects an options question with no options", () => {
		expect(() =>
			(askUserTool.inputSchema as unknown as {
				parse: (v: unknown) => unknown;
			}).parse([{ id: "q1", title: "Pick one" }]),
		).toThrow();
	});
});

describe("presentPlan (client tool)", () => {
	it("has no execute — approval/decline flows back via addToolResult", () => {
		expect(presentPlanTool.execute).toBeUndefined();
	});

	it("accepts a full plan shape", () => {
		const parsed = (presentPlanTool.inputSchema as unknown as {
			parse: (v: unknown) => unknown;
		}).parse({
			title: "Track GPU prices",
			objective: "Daily price watch across 3 retailers",
			summary: "Scrape → compare → report",
			steps: [
				{ title: "Scrape retailer pages", description: "3 URLs, batched" },
				{ title: "Compare and rank", description: "Rank by price and stock" },
			],
		});
		expect(parsed).toBeDefined();
	});

	it("requires at least one step", () => {
		expect(() =>
			(presentPlanTool.inputSchema as unknown as {
				parse: (v: unknown) => unknown;
			}).parse({ title: "Empty plan", objective: "x", steps: [] }),
		).toThrow();
	});
});
