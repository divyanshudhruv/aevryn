export class WorkflowNotFoundError extends Error {
	constructor(readonly workflowId: string) {
		super(`Workflow not found: ${workflowId}`);
		this.name = "WorkflowNotFoundError";
	}
}

export class ExecutionNotFoundError extends Error {
	constructor(readonly executionId: string) {
		super(`Execution not found: ${executionId}`);
		this.name = "ExecutionNotFoundError";
	}
}

export class ConcurrencyLimitError extends Error {
	constructor(
		readonly workflowId: string,
		readonly maxActive: number,
	) {
		super(
			`Workflow ${workflowId} already has ${maxActive} active runs; new runs blocked until one completes`,
		);
		this.name = "ConcurrencyLimitError";
	}
}

export class StateConflictError extends Error {
	constructor(
		readonly workflowId: string,
		readonly expectedVersion: number,
	) {
		super(
			`State conflict for workflow ${workflowId}: expected version ${expectedVersion} but it changed`,
		);
		this.name = "StateConflictError";
	}
}
