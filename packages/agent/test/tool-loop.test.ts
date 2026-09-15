import { describe, expect, it } from "vitest";

import {
	askUserQuestionSchema,
	askUserTool,
	presentPlanTool,
} from "../src/tools/client";
import { repairJsonText, repairToolCall } from "../src/tool-call-repair";
import { InvalidToolInputError, NoSuchToolError } from "ai";

// ─── askUser input normalization ────────────────────────────────────────────

describe("askUser schema", () => {
	it("accepts a bare array of questions", () => {
		const schema = (askUserTool as unknown as { inputSchema: { _def: unknown } })
			.inputSchema as never as {
			parse: (v: unknown) => Array<{ title: string }>;
		};
		const result = schema.parse([
			{ title: "Pick one", options: [{ title: "A" }, { title: "B" }] },
		]);
		expect(result).toHaveLength(1);
		expect(result[0]!.title).toBe("Pick one");
	});

	it("accepts a { questions: [...] } wrapper (weaker-model shape)", () => {
		const schema = (askUserTool as unknown as { inputSchema: { _def: unknown } })
			.inputSchema as never as {
			parse: (v: unknown) => Array<{ title: string }>;
		};
		const result = schema.parse({
			questions: [{ title: "Q", options: [{ title: "A" }] }],
		});
		expect(Array.isArray(result)).toBe(true);
		expect(result[0]!.title).toBe("Q");
	});

	it("rejects a question with neither options nor freeText", () => {
		const parsed = askUserQuestionSchema.safeParse({ title: "empty" });
		expect(parsed.success).toBe(false);
	});
});

// ─── presentPlan schema ─────────────────────────────────────────────────────

describe("presentPlan schema", () => {
	it("requires step descriptions (accordion content)", () => {
		const inputSchema = (presentPlanTool as unknown as {
			inputSchema: { parse: (v: unknown) => unknown };
		}).inputSchema;
		const ok = inputSchema.parse({
			title: "T",
			objective: "O",
			steps: [{ title: "S1", description: "does the thing" }],
		});
		expect(ok).toBeTruthy();

		const missing = (
			inputSchema as unknown as { safeParse: (v: unknown) => unknown }
		).safeParse({
			title: "T",
			objective: "O",
			steps: [{ title: "S1" }],
		});
		expect((missing as { success: boolean }).success).toBe(false);
	});
});

// ─── JSON repair ladder ─────────────────────────────────────────────────────

describe("repairJsonText", () => {
	it("passes valid JSON through", () => {
		expect(repairJsonText('[{"title":"a"}]')).toEqual([{ title: "a" }]);
	});

	it("fixes trailing commas", () => {
		expect(repairJsonText('[{"title":"a"},]')).toEqual([{ title: "a" }]);
	});

	it("fixes single quotes", () => {
		expect(repairJsonText("[{'title':'a'}]")).toEqual([{ title: "a" }]);
	});

	it("fixes unquoted keys", () => {
		expect(repairJsonText('[{title:"a"}]')).toEqual([{ title: "a" }]);
	});

	it("fixes smart quotes", () => {
		expect(repairJsonText('[{\u201ctitle\u201d:\u201ca\u201d}]')).toEqual([
			{ title: "a" },
		]);
	});

	it("salvages a cut-off generation", () => {
		const salvaged = repairJsonText(
			'[{"title":"a","options":[{"title":"b"},{"title":"c"},{"ti',
		);
		expect(Array.isArray(salvaged)).toBe(true);
	});

	it("returns undefined for unrecoverable text", () => {
		expect(repairJsonText("not json at all ][")).toBeUndefined();
	});
});

// ─── repairToolCall hook ────────────────────────────────────────────────────

function makeToolCall(input: string) {
	return {
		toolCallId: "tc_test",
		toolName: "askUser",
		input,
		providerExecuted: false,
		dynamic: false,
	};
}

describe("repairToolCall", () => {
	it("re-serializes repaired JSON", async () => {
		const error = new InvalidToolInputError({
			toolName: "askUser",
			toolInput: "[{title:'a'}]",
			cause: new Error("bad json"),
		});
		const repaired = await repairToolCall({
			toolCall: makeToolCall("[{title:'a'}]") as never,
			error,
			tools: {},
			messages: [],
			instructions: undefined,
			inputSchema: async () => ({}),
		});
		expect(repaired).not.toBeNull();
		expect(JSON.parse((repaired as { input: string }).input)).toEqual([
			{ title: "a" },
		]);
	});

	it("unwraps a single-key object wrapper into its array", async () => {
		const raw = '{"questions":[{"title":"a","options":[{"title":"b"}]}]}';
		const error = new InvalidToolInputError({
			toolName: "askUser",
			toolInput: raw,
			cause: new Error("expected array"),
		});
		const repaired = await repairToolCall({
			toolCall: makeToolCall(raw) as never,
			error,
			tools: {},
			messages: [],
			instructions: undefined,
			inputSchema: async () => ({}),
		});
		expect(JSON.parse((repaired as { input: string }).input)).toEqual([
			{ title: "a", options: [{ title: "b" }] },
		]);
	});

	it("leaves multi-key objects untouched (only re-serialized)", async () => {
		const raw = '{"title":"a","options":[{"title":"b"}]}';
		const error = new InvalidToolInputError({
			toolName: "askUser",
			toolInput: raw,
			cause: new Error("shape"),
		});
		const repaired = await repairToolCall({
			toolCall: makeToolCall(raw) as never,
			error,
			tools: {},
			messages: [],
			instructions: undefined,
			inputSchema: async () => ({}),
		});
		expect(JSON.parse((repaired as { input: string }).input)).toEqual({
			title: "a",
			options: [{ title: "b" }],
		});
	});

	it("returns null for NoSuchToolError (nothing to repair)", async () => {
		const error = new NoSuchToolError({
			toolName: "nope",
			availableTools: ["askUser"],
		});
		const repaired = await repairToolCall({
			toolCall: makeToolCall("{}") as never,
			error,
			tools: {},
			messages: [],
			instructions: undefined,
			inputSchema: async () => ({}),
		});
		expect(repaired).toBeNull();
	});
});
