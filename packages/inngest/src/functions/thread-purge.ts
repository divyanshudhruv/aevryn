import { ThreadService } from "@aevryn/workflow";

import { inngest } from "../client";

const threadService = new ThreadService();

const PURGE_AFTER_DAYS = 30;

export const threadPurge = inngest.createFunction(
	{
		id: "thread-purge",
		retries: 2,
		triggers: [{ cron: "0 0 * * *" }],
	},
	async ({ step }) => {
		const candidates = await step.run("list-deleted-threads", async () =>
			threadService.listDeletedOlderThan(PURGE_AFTER_DAYS),
		);

		const purged: string[] = [];
		for (const thread of candidates) {
			await step.run("hard-delete-thread", async () => {
				await threadService.hardDelete(thread.id);
				purged.push(thread.id);
			});
		}

		return { purged };
	},
);