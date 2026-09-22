import { db, messages, planSteps, steps, workflows } from "@aevryn/db";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatService } from "../src/services/chat-service";
import { WorkflowService } from "../src/services/workflow-service";

const userId = "00000000-0000-0000-0000-000000000001";
const workspaceId = "wsp_test_chat";
const threadId = "thd_test_chat";

async function seedThread() {
	const { workspaces, threads } = await import("@aevryn/db");

	await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
	await db.insert(workspaces).values({
		id: workspaceId,
		name: "test-ws-chat",
		createdBy: userId,
	});
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

describe("WorkflowService.createWorkflowFromPlan", () => {
	it("creates a workflow + ordered plan_steps and binds it to the thread", async () => {
		const { threads: threadsTable } = await import("@aevryn/db");
		const service = new WorkflowService();

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
		const workflow = await new WorkflowService().createWorkflowFromPlan({
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
		const savedAssistant = msgRows.find(
			(m: { id: string }) => m.id === assistant.id,
		);
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

	it("loadThread returns messages for replay", async () => {
		const service = new ChatService();
		await service.saveMessage({ userId, threadId, role: "user", content: "q" });
		await service.saveMessage({
			userId,
			threadId,
			role: "assistant",
			content: "a",
		});

		const loaded = await service.loadThread({ threadId, userId });
		expect(loaded.messages.map((m) => m.content)).toEqual(["q", "a"]);
	});
});
