import { z } from "zod";

export const toolContextSchema = z.object({
	userId: z.string(),
	threadId: z.string(),
	workspaceId: z.string(),
		anakinKey: z.string().nullable(),
		mem0Key: z.string().nullable(),
		workflowId: z.string().optional(),
});

export type ToolContext = z.infer<typeof toolContextSchema>;
