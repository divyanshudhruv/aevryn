export interface WireResult {
	jobId: string;
	status: "completed" | "failed";
	data?: Record<string, unknown>;
	creditsUsed: number;
	executionMs: number;
	error?: {
		code: string;
		message: string;
	};
}

export interface WireAdapter {
	readonly name: string;
	wire(actionId: string, params: Record<string, unknown>): Promise<WireResult>;
}
