import { env } from "@aevryn/env/server";
import { WorkflowService } from "@aevryn/workflow";
import { z } from "zod";
import { inngest } from "../client";
import { notificationPublishEvent } from "../events";

const workflowService = new WorkflowService();

const publishEventSchema = z.object({
	event: z.object({
		data: z.object({
			notificationId: z.string().min(1),
		}),
	}),
});

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
	const { notificationId } = result;

	const notification = await workflowService.getNotification(notificationId);
	if (!notification) {
		return { notificationId, outcome: "not-found" };
	}
	if (notification.deliveredAt) {
		return { notificationId, outcome: "delivered" };
	}
	if (notification.channel !== "webhook") {
		return { notificationId, outcome: "skipped" };
	}
	const url = notification.body?.url;
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
				subject: notification.subject,
				body: notification.body,
				workflowId: notification.workflowId,
				sentAt: new Date().toISOString(),
				baseUrl: env.WEBHOOK_BASE_URL,
			}),
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			throw new Error(`webhook responded ${response.status}`);
		}
		await workflowService.markNotificationDelivered(notificationId);
		return { notificationId, outcome: "delivered" };
	} catch {
		// Leave deliveredAt unset; the next publish attempt retries the POST.
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
