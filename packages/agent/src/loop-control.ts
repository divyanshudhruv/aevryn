import { isStepCount, type StopCondition, type ToolSet } from "ai";

import { env } from "@aevryn/env/server";

const COST_PER_INPUT_TOKEN = 0.15 / 1_000_000; // $0.15 / M input tokens
const COST_PER_OUTPUT_TOKEN = 0.6 / 1_000_000; // $0.60 / M output tokens

export function costGuardStop(budgetUsd: number): StopCondition<ToolSet, any> {
	return ({ steps }) => {
		let totalUsd = 0;

		for (const step of steps) {
			const usage = (step as { usage?: { inputTokens?: number | undefined; outputTokens?: number | undefined } }).usage;
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
		stopWhen: [isStepCount(env.AGENT_MAX_STEPS), costGuardStop(budgetUsd)],
	};
}

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export const COMPACTION_THRESHOLD_TOKENS = 100_000;
