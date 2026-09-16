import { beforeEach, describe, expect, it } from "vitest";

import { db, ids, workflows, planSteps, messages, steps } from "@aevryn/db";
import { eq, asc } from "drizzle-orm";

import { ChatService } from "../src/services/chat-service";

// Unique ids per run so repeated test executions don't collide.
const stamp = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const userId = "00000000-0000-0000-0000-000000000001";
const workspaceId = `wsp_test_${stamp}`;
const threadId = `thd_test_${stamp}`;

async function seedThread() {
	const { workspaces, threads } = await import("@aevryn/db");

	// userId 0000..0001 is a stable test user that already exists in the
	// shared Supabase cloud DB (created by prior seed runs). The FKs on
	// threads.user_id and messages.user_id are NOT DEFERRABLE, so per-run
	// raw-SQL auth seeding was removed; relying on the pre-existing row
	// keeps the suite from touching auth.users / auth.identities.

	const existing = await db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId));
	if (existing.length === 0) {
		await db.insert(workspaces).values({
			id: workspaceId,
			name: `test-ws-${stamp}`,
			createdBy: userId,
		});
	}
	await db.delete(threads).where(eq(threads.id, threadId));
	await db.insert(threads).values({
		id: threadId,
		workspaceId,
		userId,
		title: "t",
	});
}

beforeEach(async () => {
	await seedThread();
});

describe("ChatService.createWorkflowFromPlan", () => {
	it("creates a workflow + ordered plan_steps and binds it to the thread", async () => {
		const { threads: threadsTable } = await import("@aevryn/db");
		const service = new ChatService();

		const workflow = await service.createWorkflowFromPlan({
			userId,
			threadId,
			title: "Track GPU prices",
			objective: "Daily price watch",
			steps: [
				{ title: "Scrape retailers", description: "3 URLs" },
				{ title: "Compare prices" },
			],
		});

		expect(workflow.id).toMatch(/^wf_/);
		expect(workflow.status).toBe("idle");

		const stepRows = await db
			.select()
			.from(planSteps)
			.where(eq(planSteps.workflowId, workflow.id))
			.orderBy(asc(planSteps.position));
		expect(stepRows.map((s: { title: string }) => s.title)).toEqual([
			"Scrape retailers",
			"Compare prices",
		]);
		expect(stepRows[0]?.status).toBe("idle");

		const [thread] = await db
			.select({ boundWorkflowId: threadsTable.boundWorkflowId })
			.from(threadsTable)
			.where(eq(threadsTable.id, threadId));
		expect(thread?.boundWorkflowId).toBe(workflow.id);
	});
});

describe("ChatService.updatePlanStepStatus", () => {
	it("transitions a step and completes the workflow when all steps finish", async () => {
		const service = new ChatService();
		const workflow = await service.createWorkflowFromPlan({
			userId,
			threadId,
			title: "Two step plan",
			objective: "obj",
			steps: [{ title: "A" }, { title: "B" }],
		});

		await service.updatePlanStepStatus({
			userId,
			workflowId: workflow.id,
			position: 1,
			status: "completed",
		});
		await service.updatePlanStepStatus({
			userId,
			workflowId: workflow.id,
			position: 2,
			status: "completed",
		});

		const [wf] = await db
			.select({ status: workflows.status })
			.from(workflows)
			.where(eq(workflows.id, workflow.id));
		expect(wf?.status).toBe("completed");

		await service.setWorkflowStatus({
			workflowId: workflow.id,
			userId,
			status: "running",
		});
		const [running] = await db
			.select({ status: workflows.status })
			.from(workflows)
			.where(eq(workflows.id, workflow.id));
		expect(running?.status).toBe("running");
	});
});

describe("ChatService message persistence helpers", () => {
	it("saves a user message and a assistant message with usage + steps", async () => {
		const service = new ChatService();

		await service.saveMessage({
			userId,
			threadId,
			role: "user",
			content: "hello",
		});

		const assistant = await service.saveMessage({
			userId,
			threadId,
			role: "assistant",
			content: "here is the answer",
			usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
			steps: [
				{
					position: 0,
					text: "thinking",
					toolCalls: [
						{
							toolCallId: "tc1",
							toolName: "scrapeUrl",
							input: { url: "https://x.com" },
							output: { ok: true },
							status: "completed",
							startedAt: new Date().toISOString(),
							endedAt: new Date().toISOString(),
						},
					],
				},
			],
		});

		expect(assistant.id).toMatch(/^msg_/);

		const msgRows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId));
		expect(msgRows).toHaveLength(2);
		const savedAssistant = msgRows.find((m: { id: string }) => m.id === assistant.id);
		expect(savedAssistant?.usage).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		});

		const stepRows = await db
			.select()
			.from(steps)
			.where(eq(steps.messageId, assistant.id))
			.orderBy(asc(steps.position));
		expect(stepRows).toHaveLength(1);
		expect(stepRows[0]?.toolCalls[0]?.toolName).toBe("scrapeUrl");
	});

	it("loadThread returns messages and steps for replay", async () => {
		const service = new ChatService();
		await service.saveMessage({ userId, threadId, role: "user", content: "q" });
		const assistant = await service.saveMessage({
			userId,
			threadId,
			role: "assistant",
			content: "a",
		});

		const loaded = await service.loadThread({ threadId, userId });
		expect(loaded.messages.map((m) => m.content)).toEqual(["q", "a"]);
		// steps keyed by messageId for the timeline
		expect(loaded.stepsByMessageId[assistant.id]).toEqual([]);
	});
});

void ids;
