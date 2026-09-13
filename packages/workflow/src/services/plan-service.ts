import {
	db,
	ids,
	planSteps,
	type Db,
	type PlanStep,
} from "@aevryn/db";
import { and, asc, eq, max } from "drizzle-orm";

export type PlanStepStatusValue = PlanStep["status"];

export interface AddPlanStepInput {
	workflowId: string;
	title: string;
	description?: string;
	objective?: string;
	position?: number;
}

/**
 * Plan steps hang directly off the bound workflow (one plan per workflow).
 * "The plan" for a workflow is simply the ordered set of its steps plus an
 * objective, so no separate plans table exists.
 */
export class PlanService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async listSteps(workflowId: string): Promise<PlanStep[]> {
		return this.scope().query.planSteps.findMany({
			where: eq(planSteps.workflowId, workflowId),
			orderBy: [asc(planSteps.position)],
		});
	}

	async findStepById(stepId: string): Promise<PlanStep | undefined> {
		return this.scope().query.planSteps.findFirst({
			where: eq(planSteps.id, stepId),
		});
	}

	async setPlanObjective(
		workflowId: string,
		objective: string,
	): Promise<void> {
		await this.scope()
			.update(planSteps)
			.set({ objective })
			.where(eq(planSteps.workflowId, workflowId));
	}

	async addStep(input: AddPlanStepInput): Promise<PlanStep> {
		return this.scope().transaction(async (tx) => {
			const maxRow = await tx
				.select({ value: max(planSteps.position) })
				.from(planSteps)
				.where(eq(planSteps.workflowId, input.workflowId));
			const nextPosition = input.position ?? (maxRow[0]?.value ?? -1) + 1;
			const [row] = await tx
				.insert(planSteps)
				.values({
					id: ids.planStep(),
					workflowId: input.workflowId,
					position: nextPosition,
					title: input.title,
					description: input.description ?? null,
					objective: input.objective ?? null,
					status: "pending",
				})
				.returning();
			return row!;
		});
	}

	async updateStep(
		stepId: string,
		patch: {
			title?: string;
			description?: string | null;
			status?: PlanStepStatusValue;
		},
	): Promise<PlanStep | undefined> {
		const [row] = await this.scope()
			.update(planSteps)
			.set(patch)
			.where(eq(planSteps.id, stepId))
			.returning();
		return row;
	}

	async setStepStatus(
		stepId: string,
		status: PlanStepStatusValue,
	): Promise<PlanStep | undefined> {
		return this.updateStep(stepId, { status });
	}

	async deleteStep(stepId: string): Promise<void> {
		await this.scope().delete(planSteps).where(eq(planSteps.id, stepId));
	}

	async deleteByWorkflow(workflowId: string): Promise<void> {
		await this.scope()
			.delete(planSteps)
			.where(eq(planSteps.workflowId, workflowId));
	}

	async reorderSteps(
		workflowId: string,
		orderedStepIds: string[],
	): Promise<void> {
		await this.scope().transaction(async (tx) => {
			for (const [index, stepId] of orderedStepIds.entries()) {
				await tx
					.update(planSteps)
					.set({ position: index })
					.where(
						and(
							eq(planSteps.id, stepId),
							eq(planSteps.workflowId, workflowId),
						),
					);
			}
		});
	}

	/** The plan = ordered steps, ready for prompt/UI consumption. */
	async getPlan(workflowId: string): Promise<{
		workflowId: string;
		steps: PlanStep[];
	} | null> {
		const steps = await this.listSteps(workflowId);
		if (steps.length === 0) {
			return null;
		}
		return { workflowId, steps };
	}
}
