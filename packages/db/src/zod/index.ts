import { z } from "zod";

import { FAILURE_CLASSES, MEMORY_CATEGORIES } from "../domain";

/**
 * Structured payload for an external observation (what Aevryn knows about the
 * world). `content` is free-form but validated JSONB; provider metadata is
 * optional and must never contain credentials.
 */
export const observationContentSchema = z.object({
	source: z.string().min(1).optional(),
	url: z.string().url().optional(),
	text: z.string().optional(),
	data: z.record(z.string(), z.unknown()).optional(),
});

/** Current internal agent state JSONB for a workflow. */
export const agentStateSchema = z.object({
	phase: z.string().optional(),
	context: z.string().optional(),
	data: z.record(z.string(), z.unknown()).optional(),
});

/** Input to a tool/capability invocation. */
export const toolInputSchema = z.record(z.string(), z.unknown());

/** Output of a tool/capability invocation. */
export const toolOutputSchema = z.record(z.string(), z.unknown());

/** Immutable event payload. */
export const eventDataSchema = z.record(z.string(), z.unknown());

/** A memory entry content (text + optional structured data + embedding). */
export const memoryContentSchema = z.object({
	text: z.string().min(1),
	data: z.record(z.string(), z.unknown()).optional(),
});

export const failureClassSchema = z.enum(FAILURE_CLASSES);
export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);

export type ObservationContent = z.infer<typeof observationContentSchema>;
export type AgentState = z.infer<typeof agentStateSchema>;
export type ToolInput = z.infer<typeof toolInputSchema>;
export type ToolOutput = z.infer<typeof toolOutputSchema>;
export type EventData = z.infer<typeof eventDataSchema>;
export type MemoryContent = z.infer<typeof memoryContentSchema>;
