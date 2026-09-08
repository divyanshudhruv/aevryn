import { type AgentState, agentState, db, ids } from "@aevryn/db";
import { and, eq } from "drizzle-orm";

import { StateConflictError } from "../errors";
import type { DbClient } from "../types";

export interface CreateStateParams {
	workflowId: string;
	phase?: string;
	data: AgentState["data"];
}

export interface UpdateStateParams {
	phase?: string;
	data: AgentState["data"];
}

export class StateRepository {
	async findByWorkflow(
		workflowId: string,
		client: DbClient = db,
	): Promise<AgentState | null> {
		const rows = await client
			.select()
			.from(agentState)
			.where(eq(agentState.workflowId, workflowId))
			.limit(1);
		return rows[0] ?? null;
	}

	async insert(
		params: CreateStateParams,
		client: DbClient = db,
	): Promise<AgentState> {
		const rows = await client
			.insert(agentState)
			.values({
				id: ids.agentState(),
				workflowId: params.workflowId,
				phase: params.phase,
				data: params.data,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("State insert returned no row");
		}
		return row;
	}

	async updateIfVersion(
		workflowId: string,
		expectedVersion: number,
		params: UpdateStateParams,
		client: DbClient = db,
	): Promise<AgentState> {
		const rows = await client
			.update(agentState)
			.set({
				...params,
				version: expectedVersion + 1,
			})
			.where(
				and(
					eq(agentState.workflowId, workflowId),
					eq(agentState.version, expectedVersion),
				),
			)
			.returning();
		if (!rows[0]) {
			throw new StateConflictError(workflowId, expectedVersion);
		}
		return rows[0];
	}

	/**
	 * Insert-or-update the agent state for a workflow. Optimistic-versioned
	 * updates are used when a row exists; a fresh insert wins if none exists.
	 * Used for idempotent live snapshots written during an execution.
	 */
	async upsert(
		workflowId: string,
		params: UpdateStateParams,
		client: DbClient = db,
	): Promise<AgentState> {
		const existing = await this.findByWorkflow(workflowId, client);
		if (!existing) {
			if (params.data) {
				return this.insert(
					{ workflowId, phase: params.phase, data: params.data },
					client,
				);
			}
			throw new Error("Cannot create agent state without data");
		}
		const rows = await client
			.update(agentState)
			.set({
				...params,
				version: existing.version + 1,
			})
			.where(
				and(
					eq(agentState.workflowId, workflowId),
					eq(agentState.version, existing.version),
				),
			)
			.returning();
		if (!rows[0]) {
			throw new StateConflictError(workflowId, existing.version);
		}
		return rows[0];
	}
}
