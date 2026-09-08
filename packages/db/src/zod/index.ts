import { z } from "zod";

import { FAILURE_CLASSES, MEMORY_CATEGORIES } from "../domain";

export const observationContentSchema = z.object({
	source: z.string().min(1).optional(),
	url: z.string().url().optional(),
	text: z.string().optional(),
	data: z.record(z.string(), z.unknown()).optional(),
});

export const agentStateSchema = z.object({
	phase: z.string().optional(),
	context: z.string().optional(),
	data: z.record(z.string(), z.unknown()).optional(),
});

export const toolInputSchema = z.record(z.string(), z.unknown());

export const toolOutputSchema = z.record(z.string(), z.unknown());

export const eventDataSchema = z.record(z.string(), z.unknown());

export const memoryContentSchema = z.object({
	text: z.string().min(1),
	data: z.record(z.string(), z.unknown()).optional(),
});

export const failureClassSchema = z.enum(FAILURE_CLASSES);
export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);

export type ObservationContent = z.infer<typeof observationContentSchema>;
export type ToolInput = z.infer<typeof toolInputSchema>;
export type ToolOutput = z.infer<typeof toolOutputSchema>;
export type EventData = z.infer<typeof eventDataSchema>;
export type MemoryContent = z.infer<typeof memoryContentSchema>;
