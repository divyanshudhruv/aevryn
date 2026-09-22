import { env } from "@aevryn/env/server";
import { isStepCount, type StopCondition, type ToolSet } from "ai";

const COST_PER_INPUT_TOKEN = 0.15 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 0.6 / 1_000_000;

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
			toolCallGuardStop(env.AGENT_MAX_STEPS),
			attemptReplayGuardStop(MAX_PROVIDER_REPLAYS),
			replayedStepGuardStop(MAX_IDENTICAL_TOOL_ERRORS),
		],
	};
}

export const MAX_PROVIDER_REPLAYS = 2;

export const MAX_IDENTICAL_TOOL_ERRORS = 2;

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
