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

const { executionRunEvent, inngest } = await import("@aevryn/inngest");
const { WorkflowService } = await import("@aevryn/workflow");
const { db, user, workflowExecution, workflowStep, toolExecution, event } =
	await import("@aevryn/db");
const { eq } = await import("drizzle-orm");

const svc = new WorkflowService();
const OBJECTIVE = "Find the latest information about React.";
const TOKEN_CAP_CHARS = 4000;
const MAX_WAIT_MS = 180_000;
const FIXTURE_EMAIL = "verify@aevryn.local";

const fixture = await db
	.select()
	.from(user)
	.where(eq(user.email, FIXTURE_EMAIL))
	.limit(1);
const userId =
	fixture[0]?.id ??
	(
		await db
			.insert(user)
			.values({ id: "usr_verify", name: "Verify", email: FIXTURE_EMAIL })
			.returning({ id: user.id })
	)[0]?.id;
if (!userId) throw new Error("could not resolve fixture user id");

async function cleanup() {
	await db.delete(user).where(eq(user.email, FIXTURE_EMAIL));
	console.log("cleanup: deleted fixture user and all cascaded rows");
}

async function waitForTerminal(
	executionId: string,
	{ timeoutMs = MAX_WAIT_MS }: { timeoutMs?: number } = {},
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const row = (
			await db
				.select({ status: workflowExecution.status })
				.from(workflowExecution)
				.where(eq(workflowExecution.id, executionId))
				.limit(1)
		)[0];
		if (row?.status === "completed" || row?.status === "failed") {
			return row.status;
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	return null;
}

async function dispatchEvent(
	objective: string,
	tokenCapChars?: number,
): Promise<{ workflowId: string; executionId: string }> {
	const ownerId = userId;
	if (!ownerId) throw new Error("fixture user missing");
	const { workflow } = await svc.createWorkflow({ userId: ownerId, objective });
	const { execution } = await svc.startExecution({ workflowId: workflow.id });
	await inngest.send({
		name: executionRunEvent,
		data: {
			workflowId: workflow.id,
			executionId: execution.id,
			objective,
			modelContextCapChars: tokenCapChars,
		},
	});
	return { workflowId: workflow.id, executionId: execution.id };
}

async function printRunDetails(executionId: string, workflowId: string) {
	const [exRow] = await db
		.select({ status: workflowExecution.status })
		.from(workflowExecution)
		.where(eq(workflowExecution.id, executionId))
		.limit(1);
	const steps = await db
		.select()
		.from(workflowStep)
		.where(eq(workflowStep.executionId, executionId));
	const tools = await db
		.select({ tool: toolExecution.tool, status: toolExecution.status })
		.from(toolExecution)
		.where(eq(toolExecution.executionId, executionId));
	const events = await db
		.select()
		.from(event)
		.where(eq(event.workflowId, workflowId));
	console.log("run details:", {
		executionStatus: exRow?.status,
		stepCount: steps.length,
		toolCount: tools.length,
		tools: tools.map((t) => `${t.tool}:${t.status}`),
		eventTypes: events.map((e) => e.type).join(" -> "),
	});
}

async function main() {
	if (!userId) throw new Error("fixture user missing");

	const { workflowId, executionId } = await dispatchEvent(
		OBJECTIVE,
		TOKEN_CAP_CHARS,
	);
	console.log("success path: dispatched", { workflowId, executionId });
	const status = await waitForTerminal(executionId);
	if (!status)
		throw new Error(
			`timed out waiting for execution to finish (${MAX_WAIT_MS}ms)`,
		);
	console.log("success path: final status", status);
	if (status !== "completed") {
		throw new Error("expected completed execution, got " + status);
	}
	await printRunDetails(executionId, workflowId);

	const failed = await dispatchEvent(OBJECTIVE);
	console.log("failure path: dispatched (will simulate failure gate)", {
		workflowId: failed.workflowId,
		executionId: failed.executionId,
	});
	await svc.failExecution({
		executionId: failed.executionId,
		reason: "simulated failure",
	});
	const failedStatus = await waitForTerminal(failed.executionId, {
		timeoutMs: 30_000,
	});
	console.log("failure path: final status", failedStatus);
}

try {
	await main();
	console.log("RESULT: PASS");
} catch (error) {
	console.error(
		"RESULT: FAIL —",
		error instanceof Error ? error.message : error,
	);
	process.exitCode = 1;
} finally {
	await cleanup();
}
