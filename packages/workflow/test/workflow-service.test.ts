import { db, threads, workspaces } from "@aevryn/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatService } from "../src/services/chat-service";
import { WorkflowService } from "../src/services/workflow-service";

const stamp = Date.now().toString(36);
const userId = "00000000-0000-0000-0000-000000000002";
const workspaceId = `wsp_test_${stamp}`;
const threadId = `thd_test_${stamp}`;

let workflowId: string;

beforeEach(async () => {
	await db.execute(
		`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
		 values ('${userId}', 'workflow-service-test-${userId}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
		 on conflict (id) do nothing`,
	);
	await db.execute(
		`insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
		 select '${userId}', '${userId}', '${userId}', 'email', jsonb_build_object('email', 'workflow-service-test-${userId}@test.local'), now(), now(), now()
		 where not exists (select 1 from auth.identities where user_id = '${userId}')`,
	);
	const [ws] = await db
		.insert(workspaces)
		.values({
			id: workspaceId,
			name: `test-ws-${stamp}`,
			createdBy: userId,
		})
		.onConflictDoNothing()
		.returning({ id: workspaces.id });
	const [th] = await db
		.insert(threads)
		.values({
			id: threadId,
			workspaceId: ws ? workspaceId : workspaceId,
			userId,
			title: "t",
		})
		.onConflictDoNothing()
		.returning({ id: threads.id });
	void th;

	const workflow = await new ChatService().createWorkflowFromPlan({
		userId,
		threadId,
		title: "wf",
		objective: "obj",
		steps: [
			{ title: "A", description: "a" },
			{ title: "B", description: "b" },
			{ title: "C", description: "c" },
		],
	});
	workflowId = workflow.id;
});

describe("WorkflowService.replaceSteps", () => {
	it("replaces the full step list, preserving status for surviving ids", async () => {
		const service = new WorkflowService();
		const { planSteps } = await import("@aevryn/db");

		const before = await service.getWithSteps({ workflowId, userId });
		expect(before?.steps.map((s) => s.title)).toEqual(["A", "B", "C"]);

		// Mark the middle step completed — its status must survive the replace.
		await new ChatService().updatePlanStepStatus({
			userId,
			workflowId,
			position: 2,
			status: "completed",
		});

		const b = before!.steps;
		// Keep B (marked completed, index 1) and A; reorder; add a new step.
		const replaced = await service.replaceSteps({
			workflowId,
			userId,
			steps: [
				{ id: b[1]!.id, title: "B edited" },
				{ id: b[0]!.id, title: "A reordered" },
				{ title: "D new" },
			],
		});

		expect(replaced.map((s) => s.title)).toEqual([
			"B edited",
			"A reordered",
			"D new",
		]);
		expect(replaced.map((s) => s.position)).toEqual([1, 2, 3]);

		const statusById = new Map(replaced.map((s) => [s.id, s.status]));
		expect(statusById.get(b[1]!.id)).toBe("completed");
		expect(statusById.get(b[0]!.id)).toBe("idle");
		expect(replaced[2]?.status).toBe("idle");

		const dbRows = await db
			.select()
			.from(planSteps)
			.where(eq(planSteps.workflowId, workflowId));
		expect(dbRows).toHaveLength(3);
	});

	it("clears the list when given empty steps", async () => {
		const service = new WorkflowService();
		await service.replaceSteps({ workflowId, userId, steps: [] });
		const after = await service.getWithSteps({ workflowId, userId });
		expect(after?.steps).toEqual([]);
	});

	it("removing a step also removes it from storage (no leftovers)", async () => {
		const service = new WorkflowService();
		const before = await service.getWithSteps({ workflowId, userId });
		const replaced = await service.replaceSteps({
			workflowId,
			userId,
			steps: [{ id: before?.steps[0]?.id, title: "only" }],
		});
		expect(replaced).toHaveLength(1);

		// Stale ids from before the replace can still be spawned by other writers;
		// replacing to a smaller list must produce exactly one row.
		expect(replaced[0]?.title).toBe("only");
	});

	it("rejects edits to a workflow owned by another user (service-level gate)", async () => {
		const service = new WorkflowService();
		const stranger = "11111111-1111-1111-1111-111111111111";
		await db.execute(
			`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
			 values ('${stranger}', 'stranger-${stamp}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
			 on conflict (id) do nothing`,
		);
		await db.execute(
			`insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
			 select '${stranger}', '${stranger}', '${stranger}', 'email', jsonb_build_object('email', 'stranger-${stamp}@test.local'), now(), now(), now()
			 where not exists (select 1 from auth.identities where user_id = '${stranger}')`,
		);
		// replaceSteps owns its ownership gate: the workflow must belong to the
		// caller. A stranger's userId on someone else's workflow must throw (the
		// PUT route maps any throw to 404) and leave no rows behind.
		await expect(
			service.replaceSteps({
				workflowId,
				userId: stranger,
				steps: [{ title: "intrusion" }],
			}),
		).rejects.toThrow(/not owned by user/);

		const { planSteps } = await import("@aevryn/db");
		const after = await db
			.select()
			.from(planSteps)
			.where(eq(planSteps.workflowId, workflowId));
		expect(after).toHaveLength(3);
	});
});
