import { db, ids, plans, planSteps, type Db, type Plan, type PlanStep } from "@aevryn/db";
import { and, asc, eq, max } from "drizzle-orm";

export interface CreatePlanInput {
	workflowId: string;
	title: string;
	objective?: string;
	summary?: string;
}

export interface AddPlanStepInput {
	planId: string;
	title: string;
	description?: string;
	position?: number;
}

export class PlanService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async create(input: CreatePlanInput): Promise<Plan> {
		const [row] = await this.scope()
			.insert(plans)
			.values({
				id: ids.plan(),
				workflowId: input.workflowId,
				title: input.title,
				objective: input.objective ?? null,
				summary: input.summary ?? null,
				status: "draft",
			})
			.returning();
		return row!;
	}

	async findById(id: string): Promise<Plan | undefined> {
		return this.scope().query.plans.findFirst({
			where: eq(plans.id, id),
		});
	}

	async getByWorkflow(workflowId: string): Promise<Plan | undefined> {
		return this.scope().query.plans.findFirst({
			where: eq(plans.workflowId, workflowId),
		});
	}

	async update(
		id: string,
		patch: { title?: string; objective?: string | null; summary?: string | null },
	): Promise<Plan | undefined> {
		const [row] = await this.scope()
			.update(plans)
			.set(patch)
			.where(eq(plans.id, id))
			.returning();
		return row;
	}

	async setStatus(
		id: string,
		status: "draft" | "proposed" | "accepted" | "declined",
	): Promise<Plan | undefined> {
		const [row] = await this.scope()
			.update(plans)
			.set({ status })
			.where(eq(plans.id, id))
			.returning();
		return row;
	}

	async accept(workflowId: string): Promise<Plan | undefined> {
		const plan = await this.getByWorkflow(workflowId);
		if (!plan) {
			return undefined;
		}
		return this.setStatus(plan.id, "accepted");
	}

	async decline(workflowId: string): Promise<Plan | undefined> {
		const plan = await this.getByWorkflow(workflowId);
		if (!plan) {
			return undefined;
		}
		return this.setStatus(plan.id, "declined");
	}

	async deleteByWorkflow(workflowId: string): Promise<void> {
		const plan = await this.getByWorkflow(workflowId);
		if (!plan) {
			return;
		}
		await this.scope().delete(plans).where(eq(plans.id, plan.id));
	}

	async listSteps(planId: string): Promise<PlanStep[]> {
		return this.scope().query.planSteps.findMany({
			where: eq(planSteps.planId, planId),
			orderBy: [asc(planSteps.position)],
		});
	}

async addStep(input: AddPlanStepInput): Promise<PlanStep> {
		return this.scope().transaction(async (tx) => {
			const maxRow = await tx
				.select({ value: max(planSteps.position) })
				.from(planSteps)
				.where(eq(planSteps.planId, input.planId));
			const nextPosition = input.position ?? (maxRow[0]?.value ?? -1) + 1;
			const [row] = await tx
				.insert(planSteps)
				.values({
					id: ids.planStep(),
					planId: input.planId,
					position: nextPosition,
					title: input.title,
					description: input.description ?? null,
					status: "pending",
				})
				.returning();
			return row!;
		});
	}

	async updateStep(
		stepId: string,
		patch: { title?: string; description?: string | null; status?: "pending" | "active" | "completed" | "skipped" },
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
		status: "pending" | "active" | "completed" | "skipped",
	): Promise<PlanStep | undefined> {
		return this.updateStep(stepId, { status });
	}

	async deleteStep(stepId: string): Promise<void> {
		await this.scope().delete(planSteps).where(eq(planSteps.id, stepId));
	}

	async reorderSteps(planId: string, orderedStepIds: string[]): Promise<void> {
		await this.scope().transaction(async (tx) => {
			for (const [index, stepId] of orderedStepIds.entries()) {
				await tx
					.update(planSteps)
					.set({ position: index })
					.where(and(eq(planSteps.id, stepId), eq(planSteps.planId, planId)));
			}
		});
	}

	async getPlanWithSteps(workflowId: string): Promise<{
		plan: Plan;
		steps: PlanStep[];
	} | null> {
		const plan = await this.getByWorkflow(workflowId);
		if (!plan) {
			return null;
		}
		return { plan, steps: await this.listSteps(plan.id) };
	}
}