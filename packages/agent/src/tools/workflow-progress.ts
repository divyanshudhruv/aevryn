import { tool } from "ai";
import { z } from "zod";

import { type ToolContext, toolContextSchema } from "./context";

export const updateStepStatusTool = tool({
	description:
		"Record the status of a workflow plan step (run mode only). Call this as each step starts/completes so the user sees live progress.",
	inputSchema: z.object({
		position: z
			.number()
			.int()
			.min(1)
			.describe("1-based position of the step in the plan."),
		status: z
			.enum(["running", "completed", "failed", "idle"])
			.describe(
				"New status of the step. 'idle' resets it; use 'failed' with a note instead of skipping.",
			),
		note: z
			.string()
			.max(500)
			.optional()
			.describe("Short progress note shown under the step."),
	}),
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		| { ok: true; updated: true }
		| { ok: false; error: { code: string; message: string } }
	> => {
		if (!context.workflowId) {
			return {
				ok: false,
				error: {
					code: "NO_ACTIVE_WORKFLOW",
					message:
						"updateStepStatus is only available while executing an approved workflow.",
				},
			};
		}

		try {
			// Imported lazily to keep this module free of DB side effects at
			// import time (tool modules are loaded in edge-ish contexts too).
			const { planSteps, workflows } = await import("@aevryn/db");
			const { and, eq } = await import("drizzle-orm");
			const { db } = await import("@aevryn/db");

			const database = db;
			await database
				.update(planSteps)
				.set({
					status: input.status,
					...(input.note ? { description: input.note } : {}),
				})
				.where(
					and(
						eq(planSteps.workflowId, context.workflowId),
						eq(planSteps.position, input.position),
					),
				);

			// Reflect overall workflow progress.
			if (input.status === "completed") {
				const steps = await db
					.select({ status: planSteps.status })
					.from(planSteps)
					.where(eq(planSteps.workflowId, context.workflowId));
				const allDone =
					steps.length > 0 && steps.every((s) => s.status === "completed");
				if (allDone) {
					await db
						.update(workflows)
						.set({ status: "completed", updatedAt: new Date() })
						.where(eq(workflows.id, context.workflowId));
				}
			} else if (input.status === "failed") {
				await db
					.update(workflows)
					.set({ status: "failed", updatedAt: new Date() })
					.where(eq(workflows.id, context.workflowId));
			}

			return { ok: true, updated: true };
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "STEP_UPDATE_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});
