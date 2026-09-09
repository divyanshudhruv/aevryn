export type ToolCallStatus = "running" | "completed" | "failed";

export interface StepCall {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	status: ToolCallStatus;
	output?: string;
	startedAt: string;
	completedAt?: string;
}

export type ThreadMessageRole = "user" | "assistant" | "system";

export interface ThreadMessage {
	id: string;
	threadId: string;
	role: ThreadMessageRole;
	content: string;
	createdAt: string;
	toolCalls?: StepCall[];
	approvalPending?: boolean;
}