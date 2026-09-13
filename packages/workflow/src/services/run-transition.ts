import type { Db, Run, RunStatus } from "@aevryn/db";
import { db, runs } from "@aevryn/db";
import { eq } from "drizzle-orm";
import { activityService } from "./activity-service";

/**
 * Run transition helper — one small vocabulary for run state changes.
 * Every transition updates runs.status and writes the matching system
 * activity, so the run trace always matches the state.
 */

const FINISHED: ReadonlySet<RunStatus> = new Set(["completed", "failed"]);

export class RunTransition {
	constructor(private readonly client: Db = db) {}

	private async set(
		runId: string,
		status: RunStatus,
	): Promise<Run | undefined> {
		const finished = FINISHED.has(status);
		const [row] = await this.client
			.update(runs)
			.set(finished ? { status, finishedAt: new Date() } : { status })
			.where(eq(runs.id, runId))
			.returning();
		return row;
	}

	async start(runId: string, title = "Run started"): Promise<void> {
		await this.set(runId, "running");
		await activityService.record({
			runId,
			type: "system",
			status: "completed",
			stepLabel: "start",
			title,
		});
	}

	async toolWork(runId: string, title: string, detail?: unknown): Promise<void> {
		await activityService.record({
			runId,
			type: "tool",
			status: "running",
			stepLabel: "tool",
			title,
			detail,
		});
	}

	async pauseForApproval(
		runId: string,
		approvalId: string,
		what: string,
	): Promise<void> {
		await this.set(runId, "awaiting_approval");
		await activityService.record({
			runId,
			type: "system",
			status: "completed",
			stepLabel: "approval",
			title: "Waiting for approval",
			description: what,
			detail: { approvalId },
		});
	}

	async resume(runId: string): Promise<void> {
		await this.set(runId, "running");
		await activityService.record({
			runId,
			type: "system",
			status: "completed",
			stepLabel: "resume",
			title: "Resumed",
		});
	}

	async complete(runId: string, summary?: string): Promise<void> {
		await this.set(runId, "completed");
		await activityService.record({
			runId,
			type: "system",
			status: "completed",
			stepLabel: "complete",
			title: "Run completed",
			description: summary,
		});
	}

	async fail(runId: string, error: string): Promise<void> {
		await this.set(runId, "failed");
		await activityService.record({
			runId,
			type: "system",
			status: "failed",
			stepLabel: "fail",
			title: "Run failed",
			description: error,
		});
	}
}

export const runTransition = new RunTransition();
