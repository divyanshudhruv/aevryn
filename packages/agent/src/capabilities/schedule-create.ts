import { computeNextRun, ScheduleService } from "@aevryn/workflow";
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
				"Specific instruction to run at each fire. Defaults to the current objective.",
			),
		startAt: z
			.string()
			.datetime({ offset: true })
			.optional()
			.describe(
				"Optional first run time as an ISO-8601 timestamp (e.g. '2026-09-15T09:00:00Z'); defaults to now.",
			),
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

export function createScheduleCapability(context: {
	threadId: string;
	workspaceId: string;
	userId: string;
}): Capability {
	const service = new ScheduleService();
	return {
		name: "createSchedule",
		description:
			"Create a recurring schedule on this thread. The agent runs " +
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
				const startDate = parsed.data.startAt
					? new Date(parsed.data.startAt)
					: undefined;
				const nextRunAt = computeNextRun(
					parsed.data.cron,
					parsed.data.intervalSeconds,
					startDate,
				);
				const schedule = await service.upsert({
					workspaceId: context.workspaceId,
					threadId: context.threadId,
					userId: context.userId,
					cron: parsed.data.cron,
					intervalSeconds: parsed.data.intervalSeconds,
					startAt: startDate,
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