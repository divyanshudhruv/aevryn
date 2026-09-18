import { beforeEach, describe, expect, it, vi } from "vitest";

import { wireActionTool } from "../src/tools/wire-action";
import { anakinGet, anakinPost } from "../src/tools/anakin-client";

vi.mock("../src/tools/anakin-client", () => {
	const anakinGet = vi.fn(
		async (_path: string): Promise<{ status: number; body: Record<string, unknown> }> => ({
			status: 200,
			body: {},
		}),
	);
	const anakinPost = vi.fn(
		async (_path: string): Promise<{ status: number; body: Record<string, unknown> }> => ({
			status: 200,
			body: {},
		}),
	);
	const mapAnakinError = (err: unknown) => ({
		ok: false,
		error: {
			code: "TOOL_FAILED",
			message: err instanceof Error ? err.message : String(err),
		},
	});
	return { anakinGet, anakinPost, mapAnakinError };
});

type ExecArgs = Parameters<typeof wireActionTool.execute>[1];

const keylessContext = {
	userId: "00000000-0000-0000-0000-000000000000",
	threadId: "thd_wire",
	workspaceId: "wsp_wire",
	anakinKey: null,
	mem0Key: null,
};

const keyedContext = {
	...keylessContext,
	anakinKey: "ak_test",
};

function exec(input: unknown, context: object): Promise<unknown> {
	return (wireActionTool.execute!(input as never, { context } as never as ExecArgs) as Promise<unknown>).then((r) => r);
}

beforeEach(() => {
	vi.mocked(anakinGet).mockReset();
	vi.mocked(anakinPost).mockReset();
});

describe("wireActionTool keyless inline path", () => {
	it("returns the inline run result when /wire-run returns 200", async () => {
		vi.mocked(anakinPost).mockResolvedValue({
			status: 200,
			body: {
				status: "completed",
				data: { x: 1 },
				files: [
					{ name: "a.csv", content_type: "text/csv", size_bytes: 10 },
					{ name: "b.csv", content_type: "text/csv", size_bytes: 20 },
				],
				credits_used: 2,
				execution_ms: 400,
			},
		});

		const result = (await exec(
			{ actionId: "act_1", params: { query: "shoes" } },
			keylessContext,
		)) as { ok: true; result: Record<string, unknown> };

		expect(result.ok).toBe(true);
		expect(result.result.status).toBe("completed");
		expect((result.result.data as { _untrusted?: string })._untrusted).toContain('"x":1');
		expect(result.result.files).toEqual([
			{ name: "a.csv", contentType: "text/csv", sizeBytes: 10 },
			{ name: "b.csv", contentType: "text/csv", sizeBytes: 20 },
		]);
	});
});

describe("wireActionTool keyed async path", () => {
	it("submits the task and returns the polled terminal result", async () => {
		vi.mocked(anakinPost).mockResolvedValue({ status: 202, body: { job_id: "job_9" } });
		vi.mocked(anakinGet)
			.mockResolvedValueOnce({
				status: 200,
				body: { status: "processing", retry_after_ms: 1 },
			})
			.mockResolvedValue({
				status: 200,
				body: { status: "completed", data: { y: 2 } },
			});

		const result = (await exec(
			{ actionId: "act_2", credentialId: "cred_1", params: { a: 1 } },
			keyedContext,
		)) as { ok: true; result: Record<string, unknown> };

		expect(result.ok).toBe(true);
		expect(result.result.jobId).toBe("job_9");
		expect(result.result.status).toBe("completed");
		expect((result.result.data as { _untrusted?: string })._untrusted).toContain('"y":2');
		expect(vi.mocked(anakinPost)).toHaveBeenCalledWith(
			"/wire/task",
			expect.objectContaining({
				action_id: "act_2",
				credential_id: "cred_1",
			}),
			"ak_test",
			30_000,
		);
		expect(vi.mocked(anakinGet)).toHaveBeenCalledWith("/wire/jobs/job_9", undefined, "ak_test");
		expect(vi.mocked(anakinGet)).toHaveBeenCalledTimes(2);
	});

	it("surfaces a failed terminal status from the poll loop", async () => {
		vi.mocked(anakinPost).mockResolvedValue({ status: 202, body: { job_id: "job_8" } });
		vi.mocked(anakinGet).mockResolvedValue({
			status: 200,
			body: { status: "failed", error: { code: "execution_failed", message: "boom" } },
		});

		const result = (await exec(
			{ actionId: "act_3", credentialId: "cred_1" },
			keyedContext,
		)) as { ok: true; result: Record<string, unknown> };

		expect(result.ok).toBe(true);
		expect(result.result.status).toBe("failed");
		expect(result.result.error).toEqual({ code: "execution_failed", message: "boom" });
		expect(vi.mocked(anakinGet)).toHaveBeenCalledTimes(1);
	});

	it("gives up polling after the attempt window and maps the timeout error", async () => {
		vi.mocked(anakinPost).mockResolvedValue({ status: 202, body: { job_id: "job_7" } });
		vi.mocked(anakinGet).mockResolvedValue({
			status: 200,
			body: { status: "processing", retry_after_ms: 1 },
		});

		const result = (await exec(
			{ actionId: "act_4", credentialId: "cred_1" },
			keyedContext,
		)) as { ok: false; error: { code: string; message: string } };

		expect(result.ok).toBe(false);
		expect(result.error.code).toBe("TOOL_FAILED");
		expect(result.error.message).toContain("job_7");
		expect(result.error.message).toContain("did not settle");
		expect(vi.mocked(anakinGet)).toHaveBeenCalledTimes(60);
	});

	it("maps a non-202 submit response to a tool error", async () => {
		vi.mocked(anakinPost).mockResolvedValue({ status: 400, body: { message: "bad creds" } });

		const result = (await exec(
			{ actionId: "act_5", credentialId: "cred_1" },
			keyedContext,
		)) as { ok: false; error: { code: string; message: string } };

		expect(result.ok).toBe(false);
		expect(result.error.code).toBe("TOOL_FAILED");
		expect(result.error.message).toContain("bad creds");
		expect(vi.mocked(anakinGet)).not.toHaveBeenCalled();
	});

	it("refuses keyed writes when no anakin key is present", async () => {
		const result = (await exec(
			{ actionId: "act_6", credentialId: "cred_1" },
			keylessContext,
		)) as { ok: false; error: { code: string } };

		expect(result).toMatchObject({ ok: false, error: { code: "ANAKIN_KEY_REQUIRED" } });
		expect(vi.mocked(anakinPost)).not.toHaveBeenCalled();
	});
});