import { env } from "@aevryn/env/server";
import { isStepCount, type StopCondition, type ToolSet } from "ai";

const COST_PER_INPUT_TOKEN = 0.15 / 1_000_000; // $0.15 / M input tokens
const COST_PER_OUTPUT_TOKEN = 0.6 / 1_000_000; // $0.60 / M output tokens

export function costGuardStop(budgetUsd: number): StopCondition<ToolSet, any> {
	return ({ steps }) => {
		let totalUsd = 0;

		for (const step of steps) {
			const usage = (
				step as {
					usage?: {
						inputTokens?: number | undefined;
						outputTokens?: number | undefined;
					};
				}
			).usage;
			if (!usage) continue;

			totalUsd +=
				(usage.inputTokens ?? 0) * COST_PER_INPUT_TOKEN +
				(usage.outputTokens ?? 0) * COST_PER_OUTPUT_TOKEN;
		}

		return totalUsd > budgetUsd;
	};
}

export function loopGuardrails(budgetUsd: number): {
	stopWhen: Array<StopCondition<ToolSet, any>>;
} {
	return {
		stopWhen: [
			isStepCount(env.AGENT_MAX_STEPS),
			costGuardStop(budgetUsd),
			// One tool at the full step budget is a hot loop; a legit research
			// plan (flights + hotels + rail) can call searchWeb/scrapeUrl 7+
			// times in one turn, so the cap is the full budget — not half.
			toolCallGuardStop(env.AGENT_MAX_STEPS),
			// Deterministic anti-replay guards (L1): the AI SDK's streamRetries
			// re-streams a whole step verbatim after a provider error (text and
			// tool calls both), and a model that re-issues an identical tool call
			// after an error result produces the same visual doubling. Both guards
			// stop the loop on the SECOND occurrence — no model compliance needed.
			attemptReplayGuardStop(MAX_PROVIDER_REPLAYS),
			replayedStepGuardStop(MAX_IDENTICAL_TOOL_ERRORS),
		],
	};
}

/** Stop after this many steps whose provider call ended in an error (each one
 *  is a full verbatim replay of the step by the SDK's stream retry). */
export const MAX_PROVIDER_REPLAYS = 2;

/** Stop when the same tool with byte-identical input has errored this many
 *  times in one turn (e.g. out-of-credits searches re-fired verbatim). */
export const MAX_IDENTICAL_TOOL_ERRORS = 2;

/**
 * Stops the loop when any single tool has been invoked more than
 * `maxCallsPerTool` times in the turn. Guards against hot loops that hammer one
 * tool (repeated page loads, file reads, retries) while the step-count and cost
 * guards are still some distance away.
 */
export function toolCallGuardStop(
	maxCallsPerTool: number,
): StopCondition<ToolSet, any> {
	return ({ steps }) => {
		const counts = new Map<string, number>();
		for (const step of steps) {
			for (const call of step.toolCalls) {
				const count = (counts.get(call.toolName) ?? 0) + 1;
				if (count > maxCallsPerTool) {
					return true;
				}
				counts.set(call.toolName, count);
			}
		}
		return false;
	};
}

/** Defensive extraction of a step's tool results — the SDK types vary
 *  between static/dynamic tool results, so read structurally. */
function stepToolErrors(
	step: unknown,
): Array<{ toolName: string; input: unknown }> {
	const results = (step as { toolResults?: unknown } | null)?.toolResults;
	if (!Array.isArray(results)) return [];
	const errors: Array<{ toolName: string; input: unknown }> = [];
	for (const r of results) {
		const record = r as { type?: string; toolName?: string; input?: unknown };
		if (record?.type !== "tool-error") continue;
		errors.push({
			toolName: record.toolName ?? "unknown",
			input: record.input,
		});
	}
	return errors;
}

/**
 * Stops the loop when the same tool has been called with byte-identical
 * input and ERRORED `maxIdenticalErrors` times in the turn. The classic
 * doubling signature: searchWeb fails (no credits) → the model re-issues
 * the exact same call → the turn replays its narration a second time.
 * Successful calls never count — legitimate retries with fixed input stay
 * allowed until they fail.
 */
export function replayedStepGuardStop(
	maxIdenticalErrors: number,
): StopCondition<ToolSet, any> {
	return ({ steps }) => {
		const failures = new Map<string, number>();
		for (const step of steps) {
			for (const err of stepToolErrors(step)) {
				const key = `${err.toolName}\u0000${JSON.stringify(err.input ?? null)}`;
				const count = (failures.get(key) ?? 0) + 1;
				if (count >= maxIdenticalErrors) return true;
				failures.set(key, count);
			}
		}
		return false;
	};
}

/**
 * Stops the loop once `maxReplays` steps have ended with a provider error.
 * The AI SDK's stream retry (streamRetries) replays a failed step VERBATIM —
 * identical text and tool calls — which the client renders twice. The retry
 * is useful exactly once (transient provider blip); a second error means the
 * provider is down and a third attempt would just duplicate the content again.
 */
export function attemptReplayGuardStop(
	maxReplays: number,
): StopCondition<ToolSet, any> {
	return ({ steps }) => {
		let errorSteps = 0;
		for (const step of steps) {
			if (
				(step as { finishReason?: string } | null)?.finishReason === "error"
			) {
				errorSteps += 1;
				if (errorSteps >= maxReplays) return true;
			}
		}
		return false;
	};
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export const COMPACTION_THRESHOLD_TOKENS = 4_000;
