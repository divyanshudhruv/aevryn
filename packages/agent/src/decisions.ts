import { z } from "zod";

import type { CapabilityRegistry } from "./capability";

/**
 * Runtime-control decision the durable agent emits through the `emitDecision`
 * tool instead of a parsed JSON block in its reply text. Kept next to the
 * capability system so the durable runner registers it like any other tool —
 * no prompt-format parsing, no ambiguity about whether the block was emitted.
 */
export const decisionSchema = z
	.object({
		action: z.enum(["complete", "sleep", "notify", "stop", "wait"]),
		reason: z.string().max(1000).optional(),
		sleepUntil: z.coerce.date().optional(),
		waitFor: z
			.object({
				description: z.string().min(1).max(500),
				expiresInSeconds: z.number().int().min(60).max(2_592_000).optional(),
			})
			.optional(),
		notification: z
			.object({
				type: z.string().min(1).max(100),
				channel: z.enum(["in-app", "webhook"]).default("in-app"),
				subject: z.string().min(1).max(500).optional(),
				body: z.record(z.string(), z.unknown()).optional(),
			})
			.optional(),
		planProgress: z
			.object({
				currentStep: z.number().int().nonnegative(),
				status: z.enum(["in_progress", "completed"]),
			})
			.optional(),
	})
	.strict();

export type Decision = z.infer<typeof decisionSchema>;

export const DECISION_TOOL_NAME = "emitDecision";

export interface DecisionToolContext {
	onDecision: (decision: Decision) => void | Promise<void>;
}

/**
 * Register the `emitDecision` capability on a registry. The tool validates
 * its input with the shared schema and forwards the decision to the runner's
 * callback; the callback result determines the run's post-pass status in
 * persistAndCompleteStep (thread-runner). The last emitted decision wins.
 */
export function withDecisionTool(
	registry: CapabilityRegistry,
	ctx: DecisionToolContext,
): CapabilityRegistry {
	registry.register({
		name: DECISION_TOOL_NAME,
		description:
			"Control the workflow runtime: finish, sleep until a time, notify the user, stop, or wait on a webhook. " +
			"Call it exactly once when the objective's next step is a runtime action rather than more tool work. " +
			"Emit nothing to simply end the pass (the run is then marked completed).",
		inputSchema: decisionSchema,
		execute: async (input) => {
			const parsed = decisionSchema.safeParse(input);
			if (!parsed.success) {
				return {
					ok: false,
					error: {
						code: "INVALID_DECISION",
						message: parsed.error.message,
						failureClass: "fatal",
						retryable: false,
					},
				};
			}
			await ctx.onDecision(parsed.data);
			return {
				ok: true,
				data: { accepted: true, action: parsed.data.action },
			};
		},
	});
	return registry;
}
