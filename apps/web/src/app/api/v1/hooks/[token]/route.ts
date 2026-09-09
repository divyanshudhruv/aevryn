import { randomUUID } from "node:crypto";
import { executionRunEvent, inngest } from "@aevryn/inngest";
import { WorkflowService, webhookFireSchema } from "@aevryn/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workflowService = new WorkflowService();

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
	const fired = await workflowService.fireWebhook({ token, payload });
	if (!fired.ok || !fired.workflowId || !fired.instruction) {
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
	const started = await workflowService.enqueueMessage(
		fired.workflowId,
		fired.instruction,
	);
	try {
		await inngest.send({
			name: executionRunEvent,
			data: {
				workflowId: fired.workflowId,
				executionId: started.execution.id,
				prompt: fired.instruction,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await workflowService.failExecution({
			executionId: started.execution.id,
			reason: message,
		});
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
			workflowId: fired.workflowId,
			executionId: started.execution.id,
		},
		error: null,
		meta: { requestId },
	});
}
