import { agentStateSchema, observationContentSchema } from "@aevryn/db";
import { z } from "zod";

import { failureClassSchema, recoveryStatusSchema } from "./recovery";

export const createWorkflowSchema = z.object({
	userId: z.string().min(1),
	objective: z.string().min(1).max(2000),
});

export type CreateWorkflow = z.infer<typeof createWorkflowSchema>;

export const startExecutionSchema = z.object({
	workflowId: z.string().min(1),
	prompt: z.string().max(2000).optional(),
});

export type StartExecution = z.infer<typeof startExecutionSchema>;

export const completeExecutionSchema = z.object({
	executionId: z.string().min(1),
});

export type CompleteExecution = z.infer<typeof completeExecutionSchema>;

export const failExecutionSchema = z.object({
	executionId: z.string().min(1),
	reason: z.string().min(1).max(2000),
});

export type FailExecution = z.infer<typeof failExecutionSchema>;

export const toolCallRecordSchema = z.object({
	callId: z.string().min(1),
	toolName: z.string().min(1),
	input: z.record(z.string(), z.unknown()),
	output: z.record(z.string(), z.unknown()).optional(),
	status: z.enum(["completed", "failed"]),
	error: z
		.object({
			code: z.string().min(1),
			message: z.string().min(1),
		})
		.optional(),
	provider: z
		.object({
			id: z.string().min(1),
			operation: z.string().optional(),
			requestId: z.string().optional(),
			durationMs: z.number().nonnegative().optional(),
		})
		.optional(),
	startedAt: z.coerce.date(),
	completedAt: z.coerce.date(),
});

export type ToolCallRecord = z.infer<typeof toolCallRecordSchema>;

export const stepRecordSchema = z.object({
	order: z.number().int().min(0),
	kind: z.string().min(1),
	text: z.string().optional(),
	toolCalls: z.array(toolCallRecordSchema).max(50),
	createdAt: z.coerce.date(),
});

export type StepRecord = z.infer<typeof stepRecordSchema>;

export const recordStepsSchema = z.object({
	executionId: z.string().min(1),
	steps: z.array(stepRecordSchema).max(100),
});

export type RecordSteps = z.infer<typeof recordStepsSchema>;

export const statePatchSchema = agentStateSchema.partial();

export type StatePatch = z.infer<typeof statePatchSchema>;

export const applyStateSchema = z.object({
	workflowId: z.string().min(1),
	expectedVersion: z.number().int().min(1),
	patch: statePatchSchema,
});

export type ApplyState = z.infer<typeof applyStateSchema>;

export const activitySnapshotSchema = z.object({
	status: z.enum(["running", "completed", "failed", "sleeping"]),
	currentActivity: z.string().optional(),
	executionId: z.string().optional(),
	steps: z.array(
		z.object({
			order: z.number().int().min(0),
			text: z.string(),
		}),
	),
	tools: z.array(
		z.object({
			order: z.number().int().min(0),
			step: z.number().int().min(0),
			tool: z.string().min(1),
			status: z.enum(["running", "completed", "failed"]),
		}),
	),
	updatedAt: z.coerce.date(),
});

export type ActivitySnapshot = z.infer<typeof activitySnapshotSchema>;

export const toolActivityStatusSchema = z.enum([
	"called",
	"completed",
	"failed",
]);

export const toolActivityUpsertSchema = z.object({
	workflowId: z.string().min(1),
	executionId: z.string().min(1),
	order: z.number().int().min(0),
	tool: z.string().min(1),
	status: toolActivityStatusSchema,
	input: z.record(z.string(), z.unknown()).optional(),
});

export type ToolActivityUpsert = z.infer<typeof toolActivityUpsertSchema>;

export const planSchema = z.object({
	title: z.string().min(1).max(200),
	objective: z.string().min(1).max(2000),
	summary: z.string().min(1).max(2000),
	steps: z.array(z.string().min(1).max(2000)).max(20).optional(),
});

export type Plan = z.infer<typeof planSchema>;

export const createScheduleSchema = z
	.object({
		userId: z.string().min(1),
		workflowId: z.string().min(1),
		cron: z.string().min(1).max(100).optional(),
		intervalSeconds: z.number().int().positive().max(86400).optional(),
		startAt: z.coerce.date().optional(),
		config: z.record(z.string(), z.unknown()).optional(),
	})
	.superRefine((value, ctx) => {
		if (!value.cron && !value.intervalSeconds) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"schedule requires either a cron expression or intervalSeconds",
			});
		}
	});

export type CreateSchedule = z.infer<typeof createScheduleSchema>;

export const createNotificationSchema = z.object({
	userId: z.string().min(1),
	workflowId: z.string().min(1).optional(),
	type: z.string().min(1).max(100),
	channel: z.string().min(1).max(50).default("in-app"),
	subject: z.string().min(1).max(500).optional(),
	body: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNotification = z.infer<typeof createNotificationSchema>;

export const createObservationSchema = z.object({
	workflowId: z.string().min(1),
	type: z.string().min(1).max(100),
	content: observationContentSchema,
});

export type CreateObservation = z.infer<typeof createObservationSchema>;

export const createRecoveryAttemptSchema = z.object({
	workflowId: z.string().min(1),
	executionId: z.string().min(1),
	stepId: z.string().min(1).optional(),
	failureClass: failureClassSchema,
	failureCode: z.string().min(1).max(200).optional(),
	attempt: z.number().int().positive(),
	strategy: z.string().max(200).optional(),
	result: recoveryStatusSchema,
	detail: z.record(z.string(), z.unknown()).optional(),
});

export type CreateRecoveryAttempt = z.infer<typeof createRecoveryAttemptSchema>;

export const decisionSchema = z.object({
	action: z.enum(["complete", "sleep", "notify", "stop"]),
	reason: z.string().max(1000).optional(),
	statePatch: statePatchSchema.optional(),
	sleepUntil: z.coerce.date().optional(),
	observation: z
		.object({
			type: z.string().min(1).max(100),
			content: observationContentSchema,
		})
		.optional(),
	notification: z
		.object({
			type: z.string().min(1).max(100),
			subject: z.string().min(1).max(500).optional(),
			body: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
});

export type Decision = z.infer<typeof decisionSchema>;
