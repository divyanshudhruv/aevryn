import { QueueService, RunService, ThreadService } from "@aevryn/workflow";

import { inngest } from "../client";
import { queueDeliverEvent, queueDeliverEventSchema, threadRunEvent } from "../events";

const queueService = new QueueService();
const runService = new RunService();
const threadService = new ThreadService();

/**
 * Sequential queue drain. Pops the oldest queued message for a thread, starts a
 * fresh `message` run for it, and returns. The run finishing re-triggers this
 * function, so queued messages deliver strictly one-at-a-time (deliver -> wait
 * finish -> next). Skips when a run is already active or the queue is empty.
 */
export const queueDeliver = inngest.createFunction(
	{
		id: "queue-deliver",
		retries: 2,
		triggers: [{ event: queueDeliverEvent }],
	},
	async ({ event, step }) => {
		const data = queueDeliverEventSchema.parse(event.data);
		const thread = await step.run("resolve-thread", () =>
			threadService.findById(data.threadId),
		);
		if (!thread || thread.deletedAt) {
			return { status: "skipped", reason: "thread-gone" };
		}

		const stop = await step.run("check-active-run", () =>
			queueService.hasActiveRun(data.threadId),
		);
		if (stop) {
			return { status: "skipped", reason: "run-active" };
		}

		const delivered = await step.run("pop-queued-message", () =>
			queueService.deliverNext(data.threadId),
		);
		if (!delivered) {
			return { status: "skipped", reason: "queue-empty" };
		}

		const prompt = extractText(delivered);
		if (!prompt) {
			return { status: "skipped", reason: "empty-content" };
		}

		const run = await step.run("create-run", () =>
			runService.create({
				threadId: data.threadId,
				userId: delivered.userId,
				trigger: "message",
			}),
		);

		await step.sendEvent("start-thread-run", {
			name: threadRunEvent,
			data: {
				runId: run.id,
				threadId: data.threadId,
				prompt,
			},
		});

		return { status: "delivered", runId: run.id, messageId: delivered.id };
	},
);

function extractText(message: { content: unknown }): string | undefined {
	const content = (message.content ?? []) as Array<{ type?: string; text?: string }>;
	const textPart = content.find((part) => part.type === "text");
	return textPart?.text?.trim() || undefined;
}