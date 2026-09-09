import { computeNextRun, WorkflowService } from "@aevryn/workflow";
import { z } from "zod";

import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const createScheduleInputSchema = z
	.object({
		cron: z
			.string()
			.min(1)
			.max(100)
			.describe(
				"Standard 5-field cron expression (minute hour day month weekday), e.g. '0 9 * * 1' for weekly Monday 9am.",
			)
			.optional(),
		intervalSeconds: z
			.number()
			.int()
			.positive()
			.max(86_400)
			.describe("Fixed interval in seconds between runs (max 24 hours).")
			.optional(),
		prompt: z
			.string()
			.min(1)
			.max(2000)
			.optional()
			.describe(
				"Specific instruction to run at each fire. Defaults to the workflow objective.",
			),
		startAt: z.coerce
			.date()
			.optional()
			.describe("Optional first run time; defaults to now."),
	})
	.superRefine((value, ctx) => {
		if (!value.cron && !value.intervalSeconds) {
			ctx.addIssue({
				code: "custom",
				path: ["cron"],
				message: "Provide either cron or intervalSeconds.",
			});
		}
	});

export function createScheduleCapability(
	workflowId: string,
	userId: string,
): Capability {
	const service = new WorkflowService();
	return {
		name: "createSchedule",
		description:
			"Create a recurring schedule on this workflow. The workflow runs " +
			"again automatically at each scheduled time (cron expression or fixed " +
			"interval), letting you monitor something over time and report back. " +
			"Use this for 'check every ...', 'monitor ... until ...', or 'notify me " +
			"when ...' objectives instead of finishing immediately.",
		inputSchema: createScheduleInputSchema,
		async execute(input) {
			const parsed = createScheduleInputSchema.safeParse(input);
			if (!parsed.success) {
				return {
					ok: false,
					error: {
						code: "INVALID_CAPABILITY_INPUT",
						message: parsed.error.message,
						failureClass: "fatal",
						retryable: false,
					},
				};
			}
			try {
				const nextRunAt = computeNextRun(
					parsed.data.cron,
					parsed.data.intervalSeconds,
					parsed.data.startAt,
				);
				const schedule = await service.createSchedule({
					userId,
					workflowId,
					cron: parsed.data.cron,
					intervalSeconds: parsed.data.intervalSeconds,
					startAt: parsed.data.startAt,
					config: { prompt: parsed.data.prompt },
				});
				return {
					ok: true,
					data: {
						scheduleId: schedule.id,
						cron: schedule.cron,
						intervalSeconds: schedule.intervalSeconds,
						prompt: parsed.data.prompt,
						nextRunAt: nextRunAt.toISOString(),
					},
				};
			} catch (error) {
				return toCapabilityFailure(error, 0);
			}
		},
	};
}
