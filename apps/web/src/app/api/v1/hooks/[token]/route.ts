import { randomUUID } from "node:crypto";
import { inngest, threadRunEvent } from "@aevryn/inngest";
import { RunService, ThreadService, webhookFireSchema, WebhookHookService } from "@aevryn/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runService = new RunService();
const threadService = new ThreadService();
const webhookHookService = new WebhookHookService();

function jsonResponse(status: number, body: unknown): Response {
	return Response.json(body, {
		status,
		headers: { "cache-control": "no-store" },
	});
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
): Promise<Response> {
	const requestId = `req_${randomUUID()}`;
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		payload = null;
	}
	if (!webhookFireSchema.safeParse(payload).success) {
		return jsonResponse(400, {
			data: null,
			error: {
				code: "INVALID_PAYLOAD",
				message: "Webhook payload must be a non-empty JSON body.",
				details: null,
			},
			meta: { requestId },
		});
	}
	const { token } = await params;
	const { ok, hook } = await webhookHookService.consume({ token, payload });
	if (!ok || !hook) {
		return jsonResponse(404, {
			data: null,
			error: {
				code: "WEBHOOK_NOT_FOUND",
				message:
					"Webhook is unknown, already consumed, or has expired. It cannot be reused.",
				details: null,
			},
			meta: { requestId },
		});
	}
	const run = await runService.findById(hook.runId);
	if (!run) {
		return jsonResponse(404, {
			data: null,
			error: {
				code: "WEBHOOK_RUN_NOT_FOUND",
				message: "The waiting run no longer exists.",
				details: null,
			},
			meta: { requestId },
		});
	}
	const thread = await threadService.findById(hook.threadId);
	if (!thread) {
		return jsonResponse(404, {
			data: null,
			error: {
				code: "WEBHOOK_THREAD_NOT_FOUND",
				message: "The waiting thread no longer exists.",
				details: null,
			},
			meta: { requestId },
		});
	}
	await runService.resumeTriggeredBy(run.id);
	const consumed = (hook.consumePayload ?? {}) as {
		instruction?: string;
		payload?: unknown;
	};
	const instruction = consumed.instruction ?? "";
	const payloadText = JSON.stringify(consumed.payload ?? payload);
	const prompt = `${instruction}${payloadText ? `\n\nWebhook payload received for this run:\n${payloadText}` : ""}`.slice(
		0,
		2000,
	);
	try {
		await runService.createActivity({
			runId: run.id,
			type: "system",
			status: "completed",
			stepLabel: "webhook.resume",
			title: "Resumed by webhook",
			detail: {
				webhookId: hook.id,
				instruction,
				payload: payloadText,
				firedAt: new Date().toISOString(),
			},
		});
	} catch {
		// Activity bookkeeping is best-effort; the resume still proceeds.
	}
	try {
		await inngest.send({
			name: threadRunEvent,
			data: {
				runId: run.id,
				threadId: thread.id,
				prompt,
			},
		});
	} catch {
		return jsonResponse(502, {
			data: null,
			error: {
				code: "RESUME_SCHEDULE_FAILED",
				message: "Webhook accepted but the resume could not be queued.",
				details: null,
			},
			meta: { requestId },
		});
	}
	return jsonResponse(200, {
		data: {
			accepted: true,
			runId: run.id,
			threadId: thread.id,
		},
		error: null,
		meta: { requestId },
	});
}