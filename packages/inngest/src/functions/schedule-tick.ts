import { computeNextRun, WorkflowService } from "@aevryn/workflow";
import { NonRetriableError } from "inngest";

import { inngest } from "../client";
import { executionRunEvent } from "../events";

const workflowService = new WorkflowService();

interface FireOutcome {
	scheduleId: string;
	executionId?: string;
	skipped?: string;
}

interface WakeOutcome {
	executionId: string;
	nextExecutionId?: string;
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
				schedules: await workflowService.listDueSchedules(now),
				sleeping: await workflowService.listDueSleepingExecutions(now),
			};
		});

		const fired: FireOutcome[] = [];
		for (const schedule of due.schedules) {
			const outcome = await step.run("fire-schedule", async () => {
				const workflow = await workflowService.getWorkflowById(
					schedule.workflowId,
				);
				if (!workflow) {
					throw new NonRetriableError(
						`Schedule ${schedule.id} references missing workflow`,
					);
				}
				if (
					workflow.status === "cancelled" ||
					workflow.status === "failed" ||
					workflow.status === "completed" ||
					workflow.status === "paused"
				) {
					if (workflow.status !== "paused") {
						await workflowService.setScheduleEnabled(schedule.id, false);
					}
					return {
						scheduleId: schedule.id,
						skipped: `workflow ${workflow.status}`,
					} satisfies FireOutcome;
				}
				const config = (schedule.config ?? {}) as {
					prompt?: string;
				};
				const prompt = config.prompt ?? workflow.objective;
				const { execution } = await workflowService.enqueueMessage(
					workflow.id,
					prompt,
				);
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: workflow.id,
						executionId: execution.id,
						prompt,
					},
				});
				const nextRunAt = computeNextRun(
					schedule.cron ?? undefined,
					schedule.intervalSeconds ?? undefined,
				);
				await workflowService.markScheduleRan(schedule.id, nextRunAt);
				await workflowService.createNotification({
					userId: workflow.userId,
					workflowId: workflow.id,
					channel: "in-app",
					type: "schedule.started",
					subject: "Scheduled run started",
					body: { prompt },
				});
				return {
					scheduleId: schedule.id,
					executionId: execution.id,
				} satisfies FireOutcome;
			});
			fired.push(outcome);
		}

		const woken: WakeOutcome[] = [];
		for (const execution of due.sleeping) {
			const outcome = await step.run("wake-sleeping", async () => {
				const workflow = await workflowService.getWorkflowById(
					execution.workflowId,
				);
				if (!workflow) {
					return {
						executionId: execution.id,
						skipped: "workflow unavailable",
					} satisfies WakeOutcome;
				}
				if (workflow.status === "paused") {
					return {
						executionId: execution.id,
						skipped: "workflow paused",
					} satisfies WakeOutcome;
				}
				const prompt =
					execution.prompt.length > 0 ? execution.prompt : workflow.objective;
				const { execution: nextExecution } =
					await workflowService.enqueueMessage(workflow.id, prompt);
				await inngest.send({
					name: executionRunEvent,
					data: {
						workflowId: workflow.id,
						executionId: nextExecution.id,
						prompt,
					},
				});
				await workflowService.completeSupersededExecution(execution.id);
				return {
					executionId: execution.id,
					nextExecutionId: nextExecution.id,
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
