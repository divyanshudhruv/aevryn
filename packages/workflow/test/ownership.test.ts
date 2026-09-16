import { beforeEach, describe, expect, it } from "vitest";

import { db, groups, messages, threads, workspaces } from "@aevryn/db";
import { eq } from "drizzle-orm";

/** db.execute accepts SQLWrapper | string — no `as any` needed. */
const raw = (query: string) => db.execute(query);

import { ChatService } from "../src/services/chat-service";
import { WorkspaceService } from "../src/services/workspace-service";

// Unique ids per run so repeated test executions don't collide.
const stamp = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const ownerId = "00000000-0000-0000-0000-000000000001";
const attackerId = "11111111-1111-1111-1111-111111111111";
const workspaceId = `wsp_own_${stamp}`;
const threadId = `thd_own_${stamp}`;

async function seedAuthUser(id: string) {
	await raw(
		`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
		 values ('${id}', 'ownership-test-${id}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
		 on conflict (id) do nothing`,
	);
	await raw(
		`insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
		 select '${id}', '${id}', 'email', 'email', jsonb_build_object('email', 'ownership-test-${id}@test.local'), now(), now(), now()
		 where not exists (select 1 from auth.identities where user_id = '${id}')`,
	);
}

async function seedFixture() {
	await seedAuthUser(ownerId);
	await seedAuthUser(attackerId);

	const existing = await db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId));
	if (existing.length === 0) {
		await db.insert(workspaces).values({
			id: workspaceId,
			name: `test-ws-${stamp}`,
			createdBy: ownerId,
		});
	}
	await db.delete(threads).where(eq(threads.id, threadId));
	await db.insert(threads).values({
		id: threadId,
		workspaceId,
		userId: ownerId,
		title: "t",
	});
}

beforeEach(async () => {
	await seedFixture();
});

describe("ChatService ownership guards", () => {
	it("saveMessage on another user's thread throws not-found/not-owned", async () => {
		const service = new ChatService();

		await expect(
			service.saveMessage({
				userId: attackerId,
				threadId,
				role: "user",
				content: "intrusion",
			}),
		).rejects.toThrow(`Thread ${threadId} not found or not owned by user`);

		const rows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(0);
	});

	it("loadThread leaks nothing and setThreadStatus does not mutate another user's thread", async () => {
		await new ChatService().saveMessage({
			userId: ownerId,
			threadId,
			role: "user",
			content: "owner-only",
		});

		const loaded = await new ChatService().loadThread({
			threadId,
			userId: attackerId,
		});
		expect(loaded.messages).toHaveLength(0);

		const [before] = await db
			.select({ status: threads.status })
			.from(threads)
			.where(eq(threads.id, threadId));
		await new ChatService().setThreadStatus({
			threadId,
			userId: attackerId,
			status: "running",
		});
		const [after] = await db
			.select({ status: threads.status })
			.from(threads)
			.where(eq(threads.id, threadId));
		expect(after?.status).toBe(before?.status);
	});
});

describe("WorkspaceService create-path ownership", () => {
	it("createGroup and createThread reject a non-owner userId", async () => {
		const service = new WorkspaceService();

		await expect(
			service.createGroup(workspaceId, attackerId, "Intrusion"),
		).rejects.toThrow("WORKSPACE_NOT_FOUND");
		await expect(
			service.createThread(workspaceId, attackerId, null, "Intrusion"),
		).rejects.toThrow("WORKSPACE_NOT_FOUND");

		const groupRows = await db
			.select({ id: groups.id })
			.from(groups)
			.where(eq(groups.workspaceId, workspaceId));
		expect(groupRows).toHaveLength(0);
		const threadRows = await db
			.select({ id: threads.id })
			.from(threads)
			.where(eq(threads.userId, attackerId));
		expect(threadRows).toHaveLength(0);
	});
});