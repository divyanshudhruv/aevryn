import { agentStateSchema } from "@aevryn/db";
import { z } from "zod";

export const createWorkflowSchema = z.object({
	userId: z.string().min(1),
	objective: z.string().min(1).max(2000),
});

export type CreateWorkflow = z.infer<typeof createWorkflowSchema>;

export const startExecutionSchema = z.object({
	workflowId: z.string().min(1),
	prompt: z.string().max(2000),
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
	status: z.enum(["running", "completed", "failed"]),
	currentActivity: z.string().optional(),
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
