import { beforeEach, describe, expect, it } from "vitest";

import { db, ids, workflows, planSteps, messages, steps } from "@aevryn/db";
import { eq, asc } from "drizzle-orm";

import { ChatService } from "../src/services/chat-service";

// Unique ids per run so repeated test executions don't collide.
const stamp = Date.now().toString(36);
const userId = "00000000-0000-0000-0000-000000000001";
const workspaceId = `wsp_test_${stamp}`;
const threadId = `thd_test_${stamp}`;

async function seedThread() {
	const { workspaces, threads } = await import("@aevryn/db");

	// Ensure the FK target user exists in auth.users (idempotent).
	await db.execute(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL for supabase auth schema
		`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
		 values ('${userId}', 'chat-service-test-${userId}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
		 on conflict (id) do nothing` as any,
	);
	await db.execute(
		`insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
		 select '${userId}', '${userId}', 'email', 'email', jsonb_build_object('email', 'chat-service-test-${userId}@test.local'), now(), now(), now()
		 where not exists (select 1 from auth.identities where user_id = '${userId}')` as any,
	);

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
		expect(stepRows.map((s) => s.title)).toEqual([
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
			workflowId: workflow.id,
			position: 1,
			status: "completed",
		});
		await service.updatePlanStepStatus({
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
		const savedAssistant = msgRows.find((m) => m.id === assistant.id);
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
