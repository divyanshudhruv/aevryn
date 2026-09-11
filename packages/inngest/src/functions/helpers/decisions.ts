import { z } from "zod";

export const decisionSchema = z
	.object({
		action: z.enum(["complete", "sleep", "notify", "stop", "wait"]),
		reason: z.string().max(1000).optional(),
		sleepUntil: z.coerce.date().optional(),
		waitFor: z
			.object({
				description: z.string().min(1).max(500),
				expiresInSeconds: z
					.number()
					.int()
					.min(60)
					.max(2_592_000)
					.optional(),
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

export function extractDecision(text: string): Decision | null {
	const match = text.match(/```json\s*([\s\S]*?)```/);
	if (!match?.[1]) {
		return null;
	}
	try {
		return decisionSchema.parse(JSON.parse(match[1]));
	} catch {
		return null;
	}
}
