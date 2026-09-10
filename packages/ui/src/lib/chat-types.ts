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

export type ApprovalResolve = "approve" | "deny";

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface ApprovalInfo {
	id: string;
	executionId: string;
	toolName: string;
	status: ApprovalStatus;
	input: Record<string, unknown>;
	reason?: string | null;
	createdAt: string;
	decidedAt?: string | null;
}

export interface PlanIntakeOption {
	title: string;
	description: string;
}

export interface PlanIntakeQuestion {
	freeText: boolean;
	id?: string;
	title: string;
	skippable?: boolean;
	multiSelect?: boolean;
	placeholder?: string;
	options?: PlanIntakeOption[];
}

export interface PlanInfo {
	title: string;
	objective: string;
	summary: string;
	steps?: string[];
	intake?: PlanIntakeQuestion[];
}

export type PlanProgressStatus = "in_progress" | "completed";

export interface PlanProgressInfo {
	currentStep: number;
	status: PlanProgressStatus;
	note?: string;
}

export interface NotificationInfo {
	id: string;
	workflowId: string | null;
	channel: string;
	type: string;
	subject: string | null;
	body: unknown;
	createdAt: string;
	readAt: string | null;
}

export interface MemoryInfo {
	id: string;
	text: string;
	category: string;
	score: number | null;
	createdAt: string;
}