import {
	db,
	messages,
	steps as stepsTable,
	threads,
	toolCallLogs,
	workspaces,
} from "@aevryn/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatService } from "../src/services/chat-service";

/** db.execute accepts SQLWrapper | string — no `as any` needed. */
const raw = (query: string) => db.execute(query);

const stamp = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const userId = "00000000-0000-0000-0000-000000000003";
const workspaceId = `wsp_test_${stamp}`;
const threadId = `thd_test_${stamp}`;

beforeEach(async () => {
	await raw(
		`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
		 values ('${userId}', 'chat-sync-test-${userId}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
		 on conflict (id) do nothing`,
	);
	await db
		.insert(workspaces)
		.values({
			id: workspaceId,
			name: `test-ws-${stamp}`,
			createdBy: userId,
		})
		.onConflictDoNothing();
	await db.delete(threads).where(eq(threads.id, threadId));
	await db.insert(threads).values({
		id: threadId,
		workspaceId,
		userId,
		title: "t",
	});
});

describe("ChatService.saveMessage transactional persistence", () => {
	it("persists message + steps + tool-call audit log atomically", async () => {
		const service = new ChatService();
		const [beforeThread] = await db
			.select({ lastMessageAt: threads.lastMessageAt })
			.from(threads)
			.where(eq(threads.id, threadId));

		const saved = await service.saveMessage({
			userId,
			threadId,
			role: "assistant",
			content: "done",
			parts: [{ type: "text", text: "done" }],
			usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
			steps: [
				{
					position: 1,
					text: "step one",
					toolCalls: [
						{
							toolName: "query",
							toolCallId: `call_${stamp}_1`,
							input: { q: "x" },
							output: { ok: true },
							status: "completed",
							startedAt: new Date().toISOString(),
							endedAt: new Date().toISOString(),
						},
					],
				},
			],
		});

		const [row] = await db
			.select()
			.from(messages)
			.where(eq(messages.id, saved.id));
		expect(row?.role).toBe("assistant");
		expect(row?.content).toBe("done");
		expect(row?.threadId).toBe(threadId);
		expect(row?.usage?.totalTokens).toBe(14);

		const stepRows = await db
			.select()
			.from(stepsTable)
			.where(eq(stepsTable.messageId, saved.id));
		expect(stepRows).toHaveLength(1);
		expect(stepRows[0]?.position).toBe(1);
		expect(stepRows[0]?.toolCalls).toHaveLength(1);

		const logs = await db
			.select()
			.from(toolCallLogs)
			.where(
				and(
					eq(toolCallLogs.messageId, saved.id),
					eq(toolCallLogs.stepId, stepRows[0]!.id),
				),
			);
		expect(logs).toHaveLength(1);
		expect(logs[0]?.toolName).toBe("query");
		expect(logs[0]?.direction).toBe("server");

		const [afterThread] = await db
			.select({ lastMessageAt: threads.lastMessageAt })
			.from(threads)
			.where(eq(threads.id, threadId));
		expect(afterThread?.lastMessageAt).not.toBeNull();
		expect(afterThread?.lastMessageAt?.getTime()).toBeGreaterThanOrEqual(
			beforeThread?.lastMessageAt?.getTime() ?? 0,
		);
	});

	it("rejects writes to a thread owned by another user (ownership check)", async () => {
		const service = new ChatService();
		const otherId = "00000000-0000-0000-0000-000000000099";
		await raw(
			`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
			 values ('${otherId}', 'other-user-${stamp}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
			 on conflict (id) do nothing`,
		);
		await raw(
			`insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
			 select '${otherId}', '${otherId}', '${otherId}', 'email', jsonb_build_object('email', 'other-user-${stamp}@test.local'), now(), now(), now()
			 where not exists (select 1 from auth.identities where user_id = '${otherId}')`,
		);

		const strangerThread = `thd_other_${stamp}`;
		const { threads: threadsTable } = await import("@aevryn/db");
		await db
			.insert(threadsTable)
			.values({
				id: strangerThread,
				workspaceId,
				userId: otherId,
				title: "theirs",
			})
			.onConflictDoNothing();

		await expect(
			service.saveMessage({
				userId,
				threadId: strangerThread,
				role: "user",
				content: "steal",
			}),
		).rejects.toThrow(/not found or not owned/);
	});
});

describe("ChatService.syncClientMessages dedup", () => {
	it("dedups a retried draft via the clientMessageId idempotency key", async () => {
		const service = new ChatService();
		const out = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: "draft_a",
					role: "user",
					parts: [{ type: "text", text: "ship it" }],
				},
			],
		});
		expect(out).toHaveLength(1);

		// Same draft id re-sent (as the client retries before the server echo
		// replaces the id). The draft id is now the idempotency key: saveMessage
		// hits the (threadId, userId, clientMessageId) unique index, skips the
		// write, and returns the existing row — no duplicate turn.
		const existing = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: "draft_a",
					role: "user",
					parts: [{ type: "text", text: "ship it" }],
				},
				{
					id: "draft_b",
					role: "user",
					parts: [{ type: "text", text: "second" }],
				},
			],
		});
		// draft_a returned the prior persisted row under the echoed id; draft_b
		// is genuinely new.
		expect(existing).toHaveLength(2);
		expect(existing[0]?.id).not.toBe("draft_a");

		const rows = await db
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.threadId, threadId),
					eq(messages.userId, userId),
					eq(messages.role, "user"),
				),
			)
			.orderBy(messages.content);
		expect(rows.map((r) => r.content)).toEqual(["second", "ship it"]);
		expect(rows.map((r) => r.clientMessageId)).toEqual(["draft_b", "draft_a"]);
	});

	it("saveMessage with the same clientMessageId is a no-op (returns the prior row)", async () => {
		const service = new ChatService();
		const first = await service.saveMessage({
			userId,
			threadId,
			role: "user",
			content: "once",
			clientMessageId: "key_1",
		});
		const second = await service.saveMessage({
			userId,
			threadId,
			role: "user",
			content: "dupe attempt",
			clientMessageId: "key_1",
		});
		expect(second.id).toBe(first.id);
		expect(second.content).toBe("once");

		const rows = await db
			.select()
			.from(messages)
			.where(and(eq(messages.threadId, threadId), eq(messages.userId, userId)));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.content).toBe("once");
	});

	it("never persists persisted ids (msg_) or local sentinel ids (local_)", async () => {
		const service = new ChatService();
		await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: "msg_real",
					role: "user",
					parts: [{ type: "text", text: "already saved" }],
				},
				{
					id: "local_tmp",
					role: "user",
					parts: [{ type: "text", text: "not saved" }],
				},
				{ id: "draft_c", role: "user", parts: [{ type: "text", text: "" }] },
			],
		});
		const rows = await db
			.select({ id: messages.id })
			.from(messages)
			.where(and(eq(messages.threadId, threadId), eq(messages.userId, userId)));
		expect(rows).toEqual([]);
	});

	it("dedupes duplicate ids in the transport payload (first wins)", async () => {
		const service = new ChatService();
		const out = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: "asst_a",
					role: "assistant",
					parts: [{ type: "text", text: "first copy" }],
				},
				{
					id: "asst_a",
					role: "assistant",
					parts: [{ type: "text", text: "second copy" }],
				},
				{
					id: "local_tmp",
					role: "user",
					parts: [{ type: "tool-presentPlan", state: "output-available" }],
				},
				{
					id: "local_tmp",
					role: "user",
					parts: [{ type: "tool-presentPlan", state: "output-available" }],
				},
				{
					id: "asst_b",
					role: "assistant",
					parts: [{ type: "text", text: "kept" }],
				},
			],
		});
		expect(out.map((m) => m.id)).toEqual(["asst_a", "local_tmp", "asst_b"]);
		// First occurrence survives, not the later duplicate.
		expect((out[0]?.parts as Array<{ text?: string }>)[0]?.text).toBe(
			"first copy",
		);
	});

	it("demotes claimed msg_ ids that are not in this thread's DB history", async () => {
		const service = new ChatService();
		const out = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: "msg_forged",
					role: "user",
					parts: [{ type: "text", text: "claimed id" }],
				},
			],
		});
		// The claimed-but-unknown id is demoted to an anonymous draft — it can
		// never be mistaken for (or collide with) a real persisted row.
		expect(out).toHaveLength(1);
		expect(out[0]?.id.startsWith("msg_")).toBe(false);
	});

	it("keeps msg_ ids that ARE in this thread's DB history", async () => {
		const service = new ChatService();
		const saved = await service.saveMessage({
			userId,
			threadId,
			role: "user",
			content: "real row",
		});
		const out = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: saved.id,
					role: "user",
					parts: [{ type: "text", text: "real row" }],
				},
			],
		});
		expect(out).toHaveLength(1);
		expect(out[0]?.id).toBe(saved.id);
	});

	it("suffixes same-millisecond synthetic ids so they cannot collide", async () => {
		const service = new ChatService();
		const out = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{ role: "assistant", parts: [{ type: "text", text: "one" }] },
				{ role: "assistant", parts: [{ type: "text", text: "two" }] },
			],
		});
		expect(out).toHaveLength(2);
		expect(out[0]?.id).not.toBe(out[1]?.id);
	});

	it("strips reasoning parts and ignores non-user turns", async () => {
		const service = new ChatService();
		const out = await service.syncClientMessages({
			userId,
			threadId,
			clientMessages: [
				{
					id: "draft_d",
					role: "user",
					parts: [
						{ type: "reasoning", text: "think" },
						{ type: "text", text: "final answer" },
					],
				},
				{
					id: "draft_e",
					role: "assistant",
					parts: [{ type: "text", text: "reply" }],
				},
			],
		});
		// Only reasoning-stripped user text persists; assistant turn is skipped.
		const rows = await db
			.select({ id: messages.id })
			.from(messages)
			.where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(1);
		const userPart = (out[0]?.parts as Array<{ type?: string }>).map(
			(p) => p.type,
		);
		expect(userPart).toEqual(["text"]);
	});
});
