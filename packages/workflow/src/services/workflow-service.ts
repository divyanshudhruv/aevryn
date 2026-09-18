import type { Db, PlanStep, Workflow } from "@aevryn/db";
import { db, ids, planSteps, threads, workflows } from "@aevryn/db";
import { and, asc, eq } from "drizzle-orm";

/**
 * CRUD for bound workflows and their plan steps. Owned by the workflow API
 * routes (GET/PATCH/DELETE /api/workflows/[workflowId]); runtime status
 * updates stay in ChatService.
 */
export class WorkflowService {
	constructor(private readonly client: Db = db) {}

	async getWithSteps(input: {
		workflowId: string;
		userId: string;
	}): Promise<{ workflow: Workflow; steps: PlanStep[] } | null> {
		const [workflow] = await this.client
			.select()
			.from(workflows)
			.where(
				and(
					eq(workflows.id, input.workflowId),
					eq(workflows.userId, input.userId),
				),
			);
		if (!workflow) return null;

		const steps = await this.client
			.select()
			.from(planSteps)
			.where(eq(planSteps.workflowId, input.workflowId))
			.orderBy(asc(planSteps.position));

		return { workflow, steps };
	}

	async update(input: {
		workflowId: string;
		userId: string;
		patch: {
			title?: string;
			objective?: string;
			instructions?: string | null;
			autoApprove?: boolean;
		};
	}): Promise<Workflow | null> {
		const [row] = await this.client
			.update(workflows)
			.set(input.patch)
			.where(
				and(
					eq(workflows.id, input.workflowId),
					eq(workflows.userId, input.userId),
				),
			)
			.returning();
		return row ?? null;
	}

	/** Deletes the workflow, unbinds any threads pointing at it, drops steps. */
	async delete(input: { workflowId: string; userId: string }): Promise<boolean> {
		const [row] = await this.client
			.select({ id: workflows.id })
			.from(workflows)
			.where(
				and(
					eq(workflows.id, input.workflowId),
					eq(workflows.userId, input.userId),
				),
			);
		if (!row) return false;

		await this.client.transaction(async (tx) => {
			await tx
				.update(threads)
				.set({ boundWorkflowId: null })
				.where(eq(threads.boundWorkflowId, input.workflowId));
			await tx
				.delete(planSteps)
				.where(eq(planSteps.workflowId, input.workflowId));
			await tx
				.delete(workflows)
				.where(eq(workflows.id, input.workflowId));
		});
		return true;
	}

	/**
	 * Replaces the full plan-step list (reorder / add / remove / edit).
	 * Statuses are preserved for steps whose id survives the edit; new steps
	 * start idle. Ownership is enforced here (workflow must belong to the
	 * caller) so this is a security boundary on its own, not just at the route.
	 */
	async replaceSteps(input: {
		workflowId: string;
		userId: string;
		steps: Array<{
			id?: string;
			title: string;
			description?: string | null;
		}>;
	}): Promise<PlanStep[]> {
		return this.client.transaction(async (tx) => {
			const [owned] = await tx
				.select({ id: workflows.id })
				.from(workflows)
				.where(
					and(
						eq(workflows.id, input.workflowId),
						eq(workflows.userId, input.userId),
					),
				);
			if (!owned) {
				throw new Error(`Workflow ${input.workflowId} not found or not owned by user`);
			}

			const existing = await tx
				.select()
				.from(planSteps)
				.where(eq(planSteps.workflowId, input.workflowId));
			const statusById = new Map(existing.map((s) => [s.id, s.status]));

			await tx
				.delete(planSteps)
				.where(eq(planSteps.workflowId, input.workflowId));

			if (input.steps.length === 0) return [];

			const rows = input.steps.map((step, index) => ({
				id: step.id ?? ids.planStep(),
				workflowId: input.workflowId,
				userId: input.userId,
				position: index + 1,
				title: step.title,
				description: step.description ?? null,
				status: (step.id ? statusById.get(step.id) : undefined) ?? "idle",
			}));
			return tx.insert(planSteps).values(rows).returning();
		});
	}
}

export const workflowService = new WorkflowService();
