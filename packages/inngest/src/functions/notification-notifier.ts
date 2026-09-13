import { env } from "@aevryn/env/server";
import { NotificationService, RunService } from "@aevryn/workflow";
import { z } from "zod";
import { inngest } from "../client";
import { notificationPublishEvent } from "../events";

const notificationService = new NotificationService();
const runService = new RunService();

const publishEventSchema = z.object({
	event: z.object({
		data: z.object({
			notificationId: z.string().min(1),
			runId: z.string().optional(),
		}),
	}),
});

/**
 * The notification table carries no deliveredAt column, so webhook-delivery
 * idempotency lives in a run_activities system row with
 * `step_label="notification.delivered"` and `detail.notificationId`. Inngest
 * retries this function up to 5 times on failure; the marker ensures the
 * outbound POST fires at most once per (runId, notificationId).
 */
async function hasMarkedDelivered(
	runId: string | undefined,
	notificationId: string,
): Promise<boolean> {
	if (!runId) {
		return false;
	}
	const activities = await runService.listActivitiesByRun(runId, 200);
	return activities.some(
		(a) =>
			a.stepLabel === "notification.delivered" &&
			(a.detail as { notificationId?: string } | null)?.notificationId ===
				notificationId,
	);
}

async function markDelivered(
	runId: string | undefined,
	notificationId: string,
): Promise<void> {
	if (!runId) {
		return;
	}
	await runService.createActivity({
		runId,
		type: "system",
		status: "completed",
		stepLabel: "notification.delivered",
		title: "Webhook delivered",
		detail: { notificationId },
	});
}

export async function publishNotification(data: unknown): Promise<{
	notificationId: string;
	outcome: "delivered" | "skipped" | "not-found";
}> {
	const result = publishEventSchema.safeParse(data).success
		? publishEventSchema.parse(data).event.data
		: null;
	if (!result) {
		return { notificationId: "unknown", outcome: "skipped" };
	}
	const { notificationId, runId } = result;

	const notification = await notificationService.findById(notificationId);
	if (!notification) {
		return { notificationId, outcome: "not-found" };
	}
	if (notification.type !== "run") {
		return { notificationId, outcome: "skipped" };
	}
	if (await hasMarkedDelivered(runId, notificationId)) {
		return { notificationId, outcome: "delivered" };
	}
	let url: string | undefined;
	try {
		const body = JSON.parse(notification.body) as { url?: string };
		url = body.url;
	} catch {
		url = undefined;
	}
	if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
		return { notificationId, outcome: "skipped" };
	}
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				event: "aevryn:notification",
				subject: notification.title,
				body: notification.body,
				threadId: notification.threadId,
				notificationId,
				sentAt: new Date().toISOString(),
				baseUrl: env.WEBHOOK_BASE_URL,
			}),
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			throw new Error(`webhook responded ${response.status}`);
		}
		await markDelivered(runId, notificationId);
		return { notificationId, outcome: "delivered" };
	} catch {
		// Leave the marker unset; the next publish attempt retries the POST.
		return { notificationId, outcome: "skipped" };
	}
}

export const notificationNotifier = inngest.createFunction(
	{
		id: "notification-notifier",
		retries: 5,
		triggers: [{ event: notificationPublishEvent }],
	},
	async ({ event, step }) => {
		const publish = await step.run("publish-notification", () =>
			publishNotification(event.data),
		);
		return publish;
	},
);