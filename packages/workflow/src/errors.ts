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
