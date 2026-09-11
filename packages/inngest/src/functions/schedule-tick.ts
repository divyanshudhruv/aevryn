import {
	computeNextRun,
	NotificationService,
	RunService,
	ScheduleService,
	ThreadService,
} from "@aevryn/workflow";

import { inngest } from "../client";
import { threadRunEvent } from "../events";

const scheduleService = new ScheduleService();
const runService = new RunService();
const threadService = new ThreadService();
const notificationService = new NotificationService();

interface FireOutcome {
	scheduleId: string;
	runId?: string;
	skipped?: string;
}

interface WakeOutcome {
	runId: string;
	skipped?: string;
}

export const scheduleTick = inngest.createFunction(
	{
		id: "schedule-tick",
		retries: 2,
	},
	async ({ step }) => {
		const now = new Date();
		const due = await step.run("find-due-work", async () => {
			return {
				schedules: await scheduleService.listDue(now),
				sleeping: await runService.listSleepingDue(now),
			};
		});

		const fired: FireOutcome[] = [];
		for (const schedule of due.schedules) {
			const outcome = await step.run("fire-schedule", async () => {
				const thread = await threadService.findById(schedule.threadId);
				if (!thread) {
					await scheduleService.setEnabled(schedule.id, false);
					return {
						scheduleId: schedule.id,
						skipped: "thread unavailable",
					} satisfies FireOutcome;
				}
				const prompt = (
					((schedule.config ?? {}) as { prompt?: string }).prompt ??
					thread.title
				).slice(0, 2000);
				const { id: runId } = await runService.create({
					threadId: thread.id,
					userId: schedule.userId,
					trigger: "schedule",
					workflowId: thread.boundWorkflowId ?? undefined,
					promptSnapshot: { prompt },
				});
				await inngest.send({
					name: threadRunEvent,
					data: {
						runId,
						threadId: thread.id,
						prompt,
					},
				});
				const nextRunAt = computeNextRun(
					schedule.cron ?? undefined,
					schedule.intervalSeconds ?? undefined,
				);
				await scheduleService.markRan(schedule.id, nextRunAt, runId);
				try {
					await notificationService.create({
						userId: schedule.userId,
						workspaceId: schedule.workspaceId,
						threadId: thread.id,
						type: "run",
						title: "Scheduled run started",
						body: JSON.stringify({ prompt, runId }),
					});
				} catch {
					// Best-effort.
				}
				return {
					scheduleId: schedule.id,
					runId,
				} satisfies FireOutcome;
			});
			fired.push(outcome);
		}

		const woken: WakeOutcome[] = [];
		for (const run of due.sleeping) {
			const outcome = await step.run("wake-sleeping", async () => {
				const thread = await threadService.findById(run.threadId);
				if (!thread) {
					return {
						runId: run.id,
						skipped: "thread unavailable",
					} satisfies WakeOutcome;
				}
				await runService.resumeTriggeredBy(run.id);
				const prompt = (
					((run.promptSnapshot ?? {}) as { prompt?: string }).prompt ??
					thread.title
				).slice(0, 2000);
				await inngest.send({
					name: threadRunEvent,
					data: {
						runId: run.id,
						threadId: thread.id,
						prompt,
					},
				});
				return {
					runId: run.id,
				} satisfies WakeOutcome;
			});
			woken.push(outcome);
		}

		return {
			firedSchedules: fired.length,
			wokenExecutions: woken.length,
			fired,
			woken,
		};
	},
);