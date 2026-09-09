import { z } from "zod";

export const executionRunEvent = "execution/run" as const;

export const executionRunEventSchema = z.object({
	workflowId: z.string().min(1),
	executionId: z.string().min(1),
	prompt: z.string().min(1).max(2000),
	modelContextCapChars: z.number().int().positive().max(2_000_000).optional(),
});

export type ExecutionRunEventData = z.infer<typeof executionRunEventSchema>;

export const executionRunResultSchema = z.object({
	workflowId: z.string().min(1),
	executionId: z.string().min(1),
	status: z.enum(["completed", "skipped", "failed"]),
	summary: z.string(),
	stepCount: z.number().int().nonnegative(),
	toolCount: z.number().int().nonnegative(),
	planEmitted: z.boolean().optional(),
});

export type ExecutionRunResult = z.infer<typeof executionRunResultSchema>;
