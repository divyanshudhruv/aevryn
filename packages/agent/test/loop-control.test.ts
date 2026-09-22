import { describe, expect, it } from "vitest";

import {
	attemptReplayGuardStop,
	MAX_IDENTICAL_TOOL_ERRORS,
	MAX_PROVIDER_REPLAYS,
	replayedStepGuardStop,
} from "../src/loop-control";

type GuardSteps = Parameters<
	ReturnType<typeof replayedStepGuardStop>
>[0]["steps"];

const stepWithToolResults = (
	results: Array<{ type: string; toolName: string; input?: unknown }>,
): GuardSteps[number] =>
	({ toolResults: results }) as unknown as GuardSteps[number];

const errorStep = (): GuardSteps[number] =>
	({ finishReason: "error" }) as unknown as GuardSteps[number];

const okStep = (): GuardSteps[number] =>
	({ finishReason: "stop" }) as unknown as GuardSteps[number];

describe("replayedStepGuardStop", () => {
	it("does not stop on a single identical tool error", () => {
		const stop = replayedStepGuardStop(2);
		const steps = [
			stepWithToolResults([
				{ type: "tool-error", toolName: "searchWeb", input: { q: "flights" } },
			]),
		];
		expect(stop({ steps })).toBe(false);
	});

	it("stops when the same tool + byte-identical input errors twice", () => {
		const stop = replayedStepGuardStop(2);
		const failing = {
			type: "tool-error",
			toolName: "searchWeb",
			input: { q: "flights" },
		};
		const steps = [
			stepWithToolResults([failing]),
			stepWithToolResults([{ ...failing }]),
		];
		expect(stop({ steps })).toBe(true);
	});

	it("does not count identical SUCCESSFUL calls", () => {
		const stop = replayedStepGuardStop(2);
		const ok = {
			type: "tool-result",
			toolName: "searchWeb",
			input: { q: "flights" },
		};
		const steps = [stepWithToolResults([ok]), stepWithToolResults([{ ...ok }])];
		expect(stop({ steps })).toBe(false);
	});

	it("treats different inputs as different failures", () => {
		const stop = replayedStepGuardStop(2);
		const steps = [
			stepWithToolResults([
				{ type: "tool-error", toolName: "searchWeb", input: { q: "flights" } },
			]),
			stepWithToolResults([
				{ type: "tool-error", toolName: "searchWeb", input: { q: "hotels" } },
			]),
		];
		expect(stop({ steps })).toBe(false);
	});

	it("accumulates the same failing call across steps to the threshold", () => {
		const stop = replayedStepGuardStop(3);
		const failing = {
			type: "tool-error",
			toolName: "scrapeUrl",
			input: { url: "x" },
		};
		const steps = [
			stepWithToolResults([failing]),
			okStep(),
			stepWithToolResults([{ ...failing }]),
			okStep(),
			stepWithToolResults([{ ...failing }]),
		];
		expect(stop({ steps })).toBe(true);
	});

	it("ignores steps without tool results", () => {
		const stop = replayedStepGuardStop(1);
		const steps = [okStep(), stepWithToolResults([])];
		expect(stop({ steps })).toBe(false);
	});

	it("respects a threshold of 1 for the most aggressive configuration", () => {
		const stop = replayedStepGuardStop(1);
		const steps = [
			stepWithToolResults([
				{ type: "tool-error", toolName: "searchWeb", input: null },
			]),
		];
		expect(stop({ steps })).toBe(true);
	});
});

describe("attemptReplayGuardStop", () => {
	it("does not stop on a single provider-error step", () => {
		const stop = attemptReplayGuardStop(2);
		expect(stop({ steps: [errorStep()] })).toBe(false);
	});

	it("stops once two steps ended with a provider error", () => {
		const stop = attemptReplayGuardStop(2);
		expect(stop({ steps: [errorStep(), errorStep()] })).toBe(true);
	});

	it("does not count successful steps", () => {
		const stop = attemptReplayGuardStop(2);
		expect(stop({ steps: [okStep(), okStep(), errorStep()] })).toBe(false);
	});

	it("counts errors scattered across otherwise healthy steps", () => {
		const stop = attemptReplayGuardStop(2);
		expect(
			stop({ steps: [okStep(), errorStep(), okStep(), errorStep()] }),
		).toBe(true);
	});

	it("handles steps missing a finishReason", () => {
		const stop = attemptReplayGuardStop(1);
		expect(stop({ steps: [undefined as unknown as GuardSteps[number]] })).toBe(
			false,
		);
	});
});

describe("guard thresholds match the loop-control defaults", () => {
	it("the exported constants match what loopGuardrails passes", () => {
		expect(MAX_PROVIDER_REPLAYS).toBe(2);
		expect(MAX_IDENTICAL_TOOL_ERRORS).toBe(2);
	});
});
