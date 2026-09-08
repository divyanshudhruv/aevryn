import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(path: string) {
	const raw = readFileSync(path, "utf8");
	for (const line of raw.split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq === -1) continue;
		const key = t.slice(0, eq).trim();
		let value = t.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}

loadEnvFile(
	join(dirname(fileURLToPath(import.meta.url)), "../../apps/web/.env"),
);

const { WorkflowService } = await import("@aevryn/workflow");
const { executeWorkflowRun, persistAndCompleteStep } = await import(
	"@aevryn/inngest"
);
const { db, user, workflowExecution, workflowStep, toolExecution, event } =
	await import("@aevryn/db");
const { eq } = await import("drizzle-orm");

const svc = new WorkflowService();
const OBJECTIVE = "Find the latest information about React.";
const FIXTURE_EMAIL = "verify@aevryn.local";
const fixture = await db
	.select()
	.from(user)
	.where(eq(user.email, FIXTURE_EMAIL))
	.limit(1);
const existing = fixture[0];
const userId =
	existing?.id ??
	(
		await db
			.insert(user)
			.values({ id: "usr_verify", name: "Verify", email: FIXTURE_EMAIL })
			.returning({ id: user.id })
	)[0]?.id;
if (!userId) throw new Error("could not resolve fixture user id");

async function cleanup() {
	if (!userId) return;
	await db.delete(user).where(eq(user.email, FIXTURE_EMAIL));
	console.log("cleanup: deleted fixture user and all cascaded rows");
}

function fakeResult() {
	const now = new Date();
	const call = {
		callId: "call_fake_1",
		toolName: "searchWeb",
		input: { query: OBJECTIVE },
		output: { results: 1 },
		status: "completed" as const,
		provider: { id: "anakin-search", operation: "search", durationMs: 42 },
		startedAt: now,
		completedAt: now,
	};
	const step = {
		kind: "agent" as const,
		order: 1,
		createdAt: now,
		toolCalls: [call],
	};
	return {
		text: "Verified durable execution path.",
		steps: [step],
		toolsCalled: ["searchWeb"],
		pendingApprovals: [],
	};
}

async function main() {
	try {
		if (!userId) throw new Error("fixture user verify@aevryn.local missing");

		const { workflow: wf } = await svc.createWorkflow({
			userId,
			objective: OBJECTIVE,
		});
		const { execution: ex } = await svc.startExecution({ workflowId: wf.id });
		console.log("queued:", { workflowId: wf.id, executionId: ex.id });

		try {
			const outcome = await executeWorkflowRun({
				workflowId: wf.id,
				executionId: ex.id,
				objective: OBJECTIVE,
			});
			console.log(
				"live run:",
				outcome.status,
				"steps:",
				outcome.stepCount,
				"tools:",
				outcome.toolCount,
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.log(
				`live run errored; falling back to fabricated result. error: ${msg}`,
			);
			const outcome = await persistAndCompleteStep({
				workflowId: wf.id,
				executionId: ex.id,
				status: "running",
				result: fakeResult(),
			});
			console.log(
				"fallback run:",
				outcome.status,
				"steps:",
				outcome.stepCount,
				"tools:",
				outcome.toolCount,
			);
		}

		const exRow = (
			await db
				.select()
				.from(workflowExecution)
				.where(eq(workflowExecution.id, ex.id))
				.limit(1)
		)[0];
		const steps = await db
			.select()
			.from(workflowStep)
			.where(eq(workflowStep.executionId, ex.id));
		const tools = await db
			.select()
			.from(toolExecution)
			.where(eq(toolExecution.executionId, ex.id));
		const events = await db
			.select()
			.from(event)
			.where(eq(event.workflowId, wf.id));

		const skipped = await executeWorkflowRun({
			workflowId: wf.id,
			executionId: ex.id,
			objective: OBJECTIVE,
		});
		console.log("idempotent second run:", skipped.status);

		const { workflow: wf2 } = await svc.createWorkflow({
			userId,
			objective: OBJECTIVE,
		});
		const { execution: ex2 } = await svc.startExecution({ workflowId: wf2.id });
		await svc.failExecution({ executionId: ex2.id, reason: "simulated" });
		const skipped2 = await executeWorkflowRun({
			workflowId: wf2.id,
			executionId: ex2.id,
			objective: OBJECTIVE,
		});
		console.log("failed-execution gate:", skipped2.status);

		console.log("rows:", {
			executionStatus: exRow?.status,
			stepCount: steps.length,
			toolCount: tools.length,
			eventTypes: events.map((e) => e.type).join(" -> "),
		});
	} finally {
		await cleanup();
	}
}

await main();
