import { CHAT_BUDGET_USD } from "@aevryn/agent";
import { costGuardStop } from "@aevryn/agent/loop-control";
import type { RunStatus } from "@aevryn/db";
import {
	DEFAULT_USER_SETTINGS,
	db,
	encryptSecret,
	messages,
	steps as stepsTable,
	threads,
	userProviders,
	userSettings,
	workspaces,
} from "@aevryn/db";
import type { UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentService } from "../src/services/agent-service";
import { ChatService } from "../src/services/chat-service";

const stamp = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const userId = "00000000-0000-0000-0000-000000000004";
const workspaceId = `wsp_test_${stamp}`;
const threadId = `thd_test_${stamp}`;

const { mockCreateAgent } = vi.hoisted(() => ({ mockCreateAgent: vi.fn() }));

vi.mock("@aevryn/agent", () => {
	return {
		ModelRegistry: { resolve: () => ({ modelId: "gn-1" }) },
		anakinToolSet: {},
		askUserTool: {},
		beginTaskTool: {},
		buildSystemPrompt: () => "",
		createAevrynAgent: mockCreateAgent,
		createStreamRetryFlags: () => ({ providerRetries: 0 }),
		makeRetryAgentTool: () => ({}),
		presentPlanTool: {},
		STREAM_RETRIES: 1,
		streamTransform: [],
		updateStepStatusTool: {},
		CHAT_BUDGET_USD: 0.5,
	} as unknown as typeof import("@aevryn/agent");
});

interface FakeToolResult {
	toolCallId: string;
	toolName: string;
	input?: unknown;
	result?: { type: "tool-result" | "tool-error"; output?: unknown };
}

interface FakeConfig {
	finishReason: string;
	responseText: string;
	usage: { inputTokens: number; outputTokens: number; totalTokens: number };
	toolResults?: FakeToolResult[];
}

interface StreamCallbacks {
	onToolExecutionEnd?: (e: unknown) => void | Promise<void>;
	onStepEnd?: (e: unknown) => void | Promise<void>;
	onEnd?: (e: unknown) => void | Promise<void>;
}

interface StreamResponseOpts {
	onEnd?: (e: { responseMessage: UIMessage }) => void | Promise<void>;
}

function fakeAgent(config: FakeConfig) {
	return {
		stream: async (opts: StreamCallbacks) => {
			const stepCalls: Array<{
				toolCallId: string;
				toolName: string;
				input?: unknown;
			}> = [];
			for (const r of config.toolResults ?? []) {
				await opts.onToolExecutionEnd?.({
					toolCall: {
						toolCallId: r.toolCallId,
						toolName: r.toolName,
						input: r.input,
					},
					toolOutput: r.result,
				});
				stepCalls.push({
					toolCallId: r.toolCallId,
					toolName: r.toolName,
					input: r.input,
				});
			}
			if (stepCalls.length > 0) {
				await opts.onStepEnd?.({
					stepNumber: 1,
					text: "step one",
					toolCalls: stepCalls,
				});
			}
			await opts.onEnd?.({
				finishReason: config.finishReason,
				totalUsage: config.usage,
			});
			return {
				toUIMessageStreamResponse: async (resp: StreamResponseOpts) => {
					await resp.onEnd?.({
						responseMessage: {
							id: `msg_fake_${stamp}`,
							role: "assistant",
							parts: [{ type: "text", text: config.responseText }],
						},
					});
					return new Response("done", { status: 200 });
				},
			};
		},
	};
}

async function runRespond(): Promise<{
	res: Response;
	statusLog: RunStatus[];
}> {
	const chat = new ChatService();
	const statusLog: RunStatus[] = [];
	const realSetStatus = chat.setThreadStatus.bind(chat);
	chat.setThreadStatus = async (input) => {
		statusLog.push(input.status);
		await realSetStatus(input);
	};
	const service = new AgentService({ chat });
	const userMessages: UIMessage[] = [
		{ id: "msg_ui_1", role: "user", parts: [{ type: "text", text: "Say hi" }] },
	];
	const res = await service.respond({
		userId,
		workspaceId,
		threadId,
		mode: "chat",
		uiMessages: userMessages,
		modelOverride: { providerSlug: "test-provider", modelId: "gn-1" },
	});
	return { res, statusLog };
}

beforeEach(async () => {
	await db.execute(
		`insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, reauthentication_token, phone_change_token)
		 values ('${userId}', 'agent-service-test-${userId}@test.local', '', 'authenticated', 'authenticated', now(), '00000000-0000-0000-0000-000000000000', '{}', '{}', now(), now(), '', '', '', '', '', '', '')
		 on conflict (id) do nothing`,
	);
	await db.execute(
		`insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
		 select '${userId}', '${userId}', '${userId}', 'email', jsonb_build_object('email', 'agent-service-test-${userId}@test.local'), now(), now(), now()
		 where not exists (select 1 from auth.identities where user_id = '${userId}')`,
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
	await db.delete(userProviders).where(eq(userProviders.userId, userId));
	await db
		.insert(userProviders)
		.values({
			userId,
			slug: "test-provider",
			displayName: "Test Provider",
			baseUrl: "https://api.example.org/v1",
			apiKeyEncrypted: encryptSecret("sk-test"),
			models: [{ id: "gn-1" }],
		})
		.onConflictDoNothing();
	await db.delete(userSettings).where(eq(userSettings.userId, userId));
	await db.insert(userSettings).values({
		userId,
		settings: DEFAULT_USER_SETTINGS,
	});
});

describe("AgentService.respond", () => {
	it("streams a mocked turn and transitions running → retrying → running → idle", async () => {
		mockCreateAgent.mockReturnValue(
			fakeAgent({
				finishReason: "stop",
				responseText: "Mocked answer here.",
				usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
				toolResults: [
					{
						toolCallId: "call_1",
						toolName: "scrapeUrl",
						input: { url: "https://x.com" },
						result: { type: "tool-error", output: "boom" },
					},
					{
						toolCallId: "call_2",
						toolName: "searchWeb",
						input: { q: "gpu" },
						result: { type: "tool-result", output: "gpu data" },
					},
				],
			}),
		);

		const { res, statusLog } = await runRespond();

		expect(res.status).toBe(200);
		expect(statusLog).toEqual(["running", "retrying", "running", "idle"]);

		const [thread] = await db
			.select({ status: threads.status })
			.from(threads)
			.where(eq(threads.id, threadId));
		expect(thread?.status).toBe("idle");

		const rows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId));
		const assistant = rows.find((m) => m.role === "assistant");
		expect(assistant?.content).toBe("Mocked answer here.");
		expect(assistant?.usage).toEqual({
			inputTokens: 100,
			outputTokens: 200,
			totalTokens: 300,
		});
		expect(rows.filter((m) => m.role === "system")).toHaveLength(0);

		const stepRows = await db
			.select()
			.from(stepsTable)
			.where(eq(stepsTable.messageId, assistant!.id));
		expect(stepRows).toHaveLength(1);
		expect(stepRows[0]?.text).toBe("step one");
		const calls = stepRows[0]?.toolCalls as Array<{
			toolName: string;
			status: string;
		}>;
		expect(calls.map((c) => c.toolName)).toEqual(["scrapeUrl", "searchWeb"]);
		expect(calls.map((c) => c.status)).toEqual(["failed", "completed"]);
	});

	it("persists failed-turn error tile and failed status when the model errors", async () => {
		mockCreateAgent.mockReturnValue(
			fakeAgent({
				finishReason: "error",
				responseText: "gone",
				usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
				toolResults: [
					{
						toolCallId: "call_1",
						toolName: "searchWeb",
						input: { q: "gpu" },
						result: { type: "tool-result", output: "gpu data" },
					},
				],
			}),
		);

		const { res, statusLog } = await runRespond();

		expect(res.status).toBe(200);
		expect(statusLog).toEqual(["running", "failed"]);

		const [thread] = await db
			.select({ status: threads.status })
			.from(threads)
			.where(eq(threads.id, threadId));
		expect(thread?.status).toBe("failed");

		const rows = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, threadId));
		const assistant = rows.find((m) => m.role === "assistant");
		expect(assistant?.content ?? "").toContain(
			"[Work completed before this turn was cut off",
		);
		const errorTile = rows.find((m) => m.role === "system");
		expect(errorTile?.content ?? "").toContain("failed mid-run");
	});

	it("bails the loop when cumulative usage exceeds the cost budget", () => {
		const stop = costGuardStop(CHAT_BUDGET_USD);

		expect(
			stop({
				steps: [{ usage: { inputTokens: 0, outputTokens: 1_000_000 } }],
			} as never),
		).toBe(true);
		expect(
			stop({
				steps: [{ usage: { inputTokens: 1000, outputTokens: 200 } }],
			} as never),
		).toBe(false);
		expect(
			stop({
				steps: [
					{ usage: { inputTokens: 0, outputTokens: 500_000 } },
					{ usage: { inputTokens: 0, outputTokens: 500_000 } },
				],
			} as never),
		).toBe(true);
	});
});
