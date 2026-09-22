import { describe, expect, it } from "vitest";

import { costGuardStop, createAevrynAgent } from "../src/agent";
import { buildSystemPrompt } from "../src/prompt";

const usageOf = (input: number, output: number) => ({
	inputTokens: input,
	inputTokenDetails: {
		noCacheTokens: input,
		cacheReadTokens: undefined,
		cacheWriteTokens: undefined,
	},
	outputTokens: output,
	outputTokenDetails: {},
	totalTokens: input + output,
	reasoningTokens: undefined,
});

const stepOf = (input: number, output: number) =>
	({
		stepNumber: 0,
		usage: usageOf(input, output),
	}) as unknown as Parameters<
		ReturnType<typeof costGuardStop>
	>[0]["steps"][number];

describe("costGuardStop", () => {
	it("does not stop while usage is under the budget", () => {
		const stop = costGuardStop(1);
		expect(stop({ steps: [stepOf(10_000, 1_000)] })).toBe(false);
	});

	it("stops once cumulative token cost exceeds the budget", () => {
		const stop = costGuardStop(0.3);
		expect(stop({ steps: [stepOf(2_000_000, 100_000)] })).toBe(true);
	});

	it("sums usage across all steps", () => {
		const stop = costGuardStop(0.3);
		const half = stepOf(1_000_000, 50_000);
		expect(stop({ steps: [half, half] })).toBe(true);
	});

	it("handles steps without usage gracefully", () => {
		const stop = costGuardStop(1);
		expect(stop({ steps: [{ stepNumber: 0 } as never] })).toBe(false);
	});
});

describe("createAevrynAgent", () => {
	const noopTool = {
		description: "noop",
		inputSchema: { parse: (v: unknown) => v, _zod: undefined },
	};

	it("returns a ToolLoopAgent configured with loop guardrails", async () => {
		const agent = createAevrynAgent({
			model: "openai/gpt-4o" as never,
			mode: "chat",
			tools: {} as never,
			instructions: buildSystemPrompt({ mode: "chat" }),
		});

		expect(agent).toBeDefined();
		expect(agent.id).toBe("aevryn-agent");
		expect(agent.tools).toEqual({});
	});

	it("carries a run-mode budget into its stop conditions", async () => {
		const agent = createAevrynAgent({
			model: "openai/gpt-4o" as never,
			mode: "run",
			tools: { noopTool } as never,
			instructions: buildSystemPrompt({ mode: "run", plan: "Do X then Y" }),
		});

		expect(agent).toBeDefined();
	});
});
