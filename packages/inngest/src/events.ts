import { z } from "zod";

export const threadRunEvent = "thread/run" as const;

export const threadRunEventSchema = z.object({
	runId: z.string().min(1),
	threadId: z.string().min(1),
	prompt: z.string().min(1).max(2000),
	modelContextCapChars: z.number().int().positive().max(2_000_000).optional(),
	recoveryContext: z
		.object({
			failureCode: z.string().optional(),
			failureMessage: z.string().optional(),
			attempt: z.number().int().positive(),
		})
		.optional(),
	approvedToolNames: z.array(z.string().min(1)).max(20).optional(),
});

export type ThreadRunEventData = z.infer<typeof threadRunEventSchema>;

export const notificationPublishEvent = "notification/publish" as const;

export const notificationPublishEventSchema = z.object({
	notificationId: z.string().min(1),
	runId: z.string().optional(),
});

export type NotificationPublishEventData = z.infer<
	typeof notificationPublishEventSchema
>;

export const threadRunResultSchema = z.object({
	runId: z.string().min(1),
	threadId: z.string().min(1),
	status: z.enum([
		"completed",
		"skipped",
		"failed",
		"sleeping",
		"waiting",
		"cancelled",
		"awaiting_approval",
	]),
	summary: z.string(),
	stepCount: z.number().int().nonnegative(),
	toolCount: z.number().int().nonnegative(),
	planEmitted: z.boolean().optional(),
});

export type ThreadRunResult = z.infer<typeof threadRunResultSchema>;