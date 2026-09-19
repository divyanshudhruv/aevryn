import type { RunStatus } from "@aevryn/db";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TurnLifecycle } from "../src/services/agent-turn";
import type { ChatService } from "../src/services/chat-service";

/** Minimal ChatService stub — TurnLifecycle only calls these three. */
function fakeChat() {
	return {
		setThreadStatus: vi.fn(async (_input: { status: RunStatus }) => {}),
		saveMessage: vi.fn(async (_input: unknown) => ({})),
		setWorkflowStatus: vi.fn(async (_input: unknown) => {}),
	} as unknown as ChatService;
}

function lifecycle(overrides?: {
	chat?: ChatService;
	mode?: "chat" | "run";
	boundWorkflow?: { id: string } | null;
	signal?: AbortSignal | null;
	onTurnCompleted?: () => void;
}) {
	const chat = overrides?.chat ?? fakeChat();
	const lc = new TurnLifecycle({
		chat,
		userId: "u1",
		threadId: "t1",
		mode: overrides?.mode ?? "chat",
		boundWorkflow: (overrides?.boundWorkflow ?? null) as never,
		signal: overrides?.signal,
		onTurnCompleted: overrides?.onTurnCompleted,
	});
	return { chat, lc };
}

function toolEnd(id: string, name: string, input: unknown, error?: string) {
	return {
		toolCall: { toolCallId: id, toolName: name, input },
		toolOutput: error
			? { type: "tool-error", error }
			: { type: "tool-result", output: "ok" },
	};
}

function stepEnd(
	calls: Array<{ id: string; name: string }>,
	opts?: { finishReason?: string; text?: string },
) {
	return {
		stepNumber: 0,
		text: opts?.text ?? "step",
		finishReason: opts?.finishReason,
		toolCalls: calls.map((c) => ({ toolCallId: c.id, toolName: c.name })),
	};
}

beforeEach(() => {
	vi.restoreAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("TurnLifecycle status queue", () => {
	it("dedupes consecutive identical statuses", async () => {
		const { chat, lc } = lifecycle();
		await lc.setStatus("running");
		await lc.setStatus("running");
		await lc.setStatus("completed");
		expect(chat.setThreadStatus).toHaveBeenCalledTimes(2);
		expect(chat.setThreadStatus).toHaveBeenLastCalledWith({
			threadId: "t1",
			userId: "u1",
			status: "completed",
		});
	});

	it("serializes out-of-order writes in call order", async () => {
		const { chat, lc } = lifecycle();
		const order: string[] = [];
		vi.mocked(chat.setThreadStatus).mockImplementation(async (input) => {
			await new Promise((r) =>
				setTimeout(r, input.status === "running" ? 20 : 0),
			);
			order.push(input.status);
		});
		void lc.setStatus("running");
		await lc.setStatus("completed");
		expect(order).toEqual(["running", "completed"]);
	});
});

describe("TurnLifecycle happy turn", () => {
	it("persists message + parts, sets completed, fires onTurnCompleted", async () => {
		const onTurnCompleted = vi.fn();
		const { chat, lc } = lifecycle({ onTurnCompleted });
		await lc.setStatus("running");
		lc.onToolExecutionEnd(toolEnd("c1", "searchWeb", { q: "gpu" }));
		lc.onStepEnd(stepEnd([{ id: "c1", name: "searchWeb" }]));
		await lc.onAgentEnd({
			finishReason: "stop",
			totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
		});
		const message: UIMessage = {
			id: "m1",
			role: "assistant",
			parts: [
				{ type: "text", text: "Here is the answer." },
				{ type: "reasoning", text: "hidden" },
			] as never,
		};
		await lc.finishTurn(message);

		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			role: string;
			content: string;
			usage?: unknown;
			steps?: unknown[];
		}>;
		const assistant = saved.find((m) => m.role === "assistant");
		expect(assistant?.content).toBe("Here is the answer.");
		expect(assistant?.usage).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			totalTokens: 15,
		});
		expect(assistant?.steps).toHaveLength(1);
		// Reasoning stripped from persistence.
		const parts = (assistant as unknown as { parts: Array<{ type: string }> })
			.parts;
		expect(parts.some((p) => p.type === "reasoning")).toBe(false);
		expect(saved.filter((m) => m.role === "system")).toHaveLength(0);
		expect(chat.setThreadStatus).toHaveBeenLastCalledWith({
			threadId: "t1",
			userId: "u1",
			status: "completed",
		});
		expect(onTurnCompleted).toHaveBeenCalledTimes(1);
	});

	it("sets awaiting_approval when a client tool is still pending", async () => {
		const { chat, lc } = lifecycle();
		await lc.onAgentEnd({ finishReason: "stop", totalUsage: {} });
		const message: UIMessage = {
			id: "m1",
			role: "assistant",
			parts: [
				{
					type: "tool-askUser",
					state: "input-available",
					input: {},
				} as never,
			],
		};
		await lc.finishTurn(message);
		expect(chat.setThreadStatus).toHaveBeenLastCalledWith({
			threadId: "t1",
			userId: "u1",
			status: "awaiting_approval",
		});
	});
});

describe("TurnLifecycle failed turn", () => {
	it("persists digest + error tile, marks failed, dedupes double finish", async () => {
		const { chat, lc } = lifecycle();
		lc.onToolExecutionEnd(toolEnd("c1", "scrapeUrl", { url: "https://x" }));
		lc.onToolExecutionEnd(toolEnd("c2", "searchWeb", { q: "gpu" }));
		lc.onStepEnd(stepEnd([{ id: "c1", name: "scrapeUrl" }]));
		await lc.onAgentEnd({
			finishReason: "error",
			totalUsage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
		});
		await lc.finishTurn();
		// Raced/duplicate stream-level finish must not double-persist.
		await lc.finishTurn({ id: "m1", role: "assistant", parts: [] });

		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			role: string;
			content: string;
		}>;
		const assistant = saved.filter((m) => m.role === "assistant");
		expect(assistant).toHaveLength(1);
		expect(assistant[0]?.content).toContain(
			"[Work completed before this turn was cut off",
		);
		expect(assistant[0]?.content).toContain("✓ scrapeUrl");
		expect(assistant[0]?.content).toContain("✓ searchWeb");
		const tiles = saved.filter((m) => m.role === "system");
		expect(tiles).toHaveLength(1);
		expect(tiles[0]?.content).toContain("failed mid-run");
		expect(chat.setThreadStatus).toHaveBeenLastCalledWith({
			threadId: "t1",
			userId: "u1",
			status: "failed",
		});
	});

	it("names the last completed step as the resume hint", async () => {
		const { chat, lc } = lifecycle();
		lc.onToolExecutionEnd(toolEnd("c1", "searchWeb", { q: "gpu" }));
		lc.onStepEnd(
			stepEnd([{ id: "c1", name: "searchWeb" }], {
				text: "Scraping retailers",
			}),
		);
		await lc.onAgentEnd({ finishReason: "error", totalUsage: {} });
		await lc.finishTurn();
		const tiles = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			role: string;
			content: string;
		}>;
		expect(tiles.find((m) => m.role === "system")?.content).toContain(
			"Completed so far: Scraping retailers (searchWeb succeeded)",
		);
	});
});

describe("TurnLifecycle abort", () => {
	it("persists the digest, resets to idle (not failed), no error tile", async () => {
		const abort = new AbortController();
		const { chat, lc } = lifecycle({ signal: abort.signal });
		abort.abort();
		lc.onToolExecutionEnd(toolEnd("c1", "searchWeb", { q: "gpu" }));
		lc.onStepEnd(stepEnd([{ id: "c1", name: "searchWeb" }]));
		await lc.onAgentEnd({
			finishReason: "other",
			totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
		});
		await lc.finishTurn();
		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			role: string;
			content: string;
		}>;
		expect(saved.find((m) => m.role === "assistant")?.content).toContain(
			"[Work completed before this turn was cut off",
		);
		expect(saved.filter((m) => m.role === "system")).toHaveLength(0);
		expect(chat.setThreadStatus).toHaveBeenLastCalledWith({
			threadId: "t1",
			userId: "u1",
			status: "idle",
		});
	});

	it("does not treat a normal stop with a signal as an abort", async () => {
		const { chat, lc } = lifecycle({ signal: new AbortController().signal });
		await lc.onAgentEnd({ finishReason: "stop", totalUsage: {} });
		await lc.finishTurn({
			id: "m1",
			role: "assistant",
			parts: [{ type: "text", text: "normal answer" }],
		});
		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			role: string;
			content: string;
		}>;
		const assistant = saved.find((m) => m.role === "assistant");
		expect(assistant?.content).toBe("normal answer");
		expect(assistant?.content).not.toContain("[Work completed before");
	});
});

describe("TurnLifecycle loop guard", () => {
	it("fires the warning tile when the same tool+input fails twice", async () => {
		const { chat, lc } = lifecycle();
		lc.onToolExecutionEnd(
			toolEnd("c1", "scrapeUrl", { url: "https://x" }, "boom"),
		);
		lc.onStepEnd(stepEnd([{ id: "c1", name: "scrapeUrl" }]));
		lc.onToolExecutionEnd(
			toolEnd("c2", "scrapeUrl", { url: "https://x" }, "boom"),
		);
		lc.onStepEnd(stepEnd([{ id: "c2", name: "scrapeUrl" }]));
		await lc.onAgentEnd({ finishReason: "stop", totalUsage: {} });
		await lc.finishTurn({
			id: "m1",
			role: "assistant",
			parts: [{ type: "text", text: "partial answer" }],
		});
		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			role: string;
			content: string;
		}>;
		expect(saved.find((m) => m.role === "system")?.content).toContain(
			'stopped early to avoid repeating itself — the same tool call ("scrapeUrl") failed twice with identical input',
		);
		// Turn is NOT failed.
		expect(chat.setThreadStatus).toHaveBeenLastCalledWith({
			threadId: "t1",
			userId: "u1",
			status: "completed",
		});
	});
});

describe("TurnLifecycle retry collapse", () => {
	it("collapses contained retried text parts only when a retry happened", async () => {
		const { chat, lc } = lifecycle();
		lc.onProviderRetry();
		await lc.onAgentEnd({ finishReason: "stop", totalUsage: {} });
		await lc.finishTurn({
			id: "m1",
			role: "assistant",
			parts: [
				{ type: "text", text: "partial narr" },
				{ type: "text", text: "partial narration continued" },
			] as never,
		});
		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			parts: Array<{ type: string; text?: string }>;
		}>;
		const texts = saved[0]!.parts.filter((p) => p.type === "text");
		expect(texts).toHaveLength(1);
		expect(texts[0]?.text).toBe("partial narration continued");
	});

	it("leaves normal multi-part text alone without a retry", async () => {
		const { chat, lc } = lifecycle();
		await lc.onAgentEnd({ finishReason: "stop", totalUsage: {} });
		await lc.finishTurn({
			id: "m1",
			role: "assistant",
			parts: [
				{ type: "text", text: "one" },
				{ type: "text", text: "two" },
			] as never,
		});
		const saved = vi
			.mocked(chat.saveMessage)
			.mock.calls.map((c) => c[0]) as Array<{
			parts: Array<{ type: string }>;
		}>;
		expect(saved[0]!.parts.filter((p) => p.type === "text")).toHaveLength(2);
	});
});

describe("TurnLifecycle run mode", () => {
	it("updates workflow status to running when a workflow is bound", async () => {
		const workflowId = "wf_1";
		const { chat, lc } = lifecycle({
			mode: "run",
			boundWorkflow: { id: workflowId },
		});
		await lc.onAgentEnd({ finishReason: "stop", totalUsage: {} });
		await lc.finishTurn({ id: "m1", role: "assistant", parts: [] });
		expect(chat.setWorkflowStatus).toHaveBeenCalledWith({
			workflowId,
			userId: "u1",
			status: "running",
		});
	});
});
