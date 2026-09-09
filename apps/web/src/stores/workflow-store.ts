import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkflowStatus =
	| "draft"
	| "active"
	| "paused"
	| "sleeping"
	| "waiting"
	| "awaiting_approval"
	| "completed"
	| "cancelled"
	| "failed";

export interface WorkflowState {
	id: string;
	threadId: string;
	status: WorkflowStatus;
	objective: string;
	createdAt: string;
	updatedAt?: string;
}

interface WorkflowStore {
	workflowsByThread: Record<string, WorkflowState>;
	getWorkflow: (threadId: string) => WorkflowState | undefined;
	setWorkflow: (threadId: string, workflow: WorkflowState) => void;
	updateWorkflow: (
		threadId: string,
		updates: Partial<WorkflowState>,
	) => void;
	removeWorkflow: (threadId: string) => void;
}

export const useWorkflowStore = create<WorkflowStore>()(
	persist(
		(set, get) => ({
			workflowsByThread: {},
			getWorkflow: (threadId) => get().workflowsByThread[threadId],
			setWorkflow: (threadId, workflow) =>
				set((state) => ({
					workflowsByThread: {
						...state.workflowsByThread,
						[threadId]: workflow,
					},
				})),
			updateWorkflow: (threadId, updates) =>
				set((state) => {
					const existing = state.workflowsByThread[threadId];
					if (!existing) return state;
					return {
						workflowsByThread: {
							...state.workflowsByThread,
							[threadId]: { ...existing, ...updates },
						},
					};
				}),
			removeWorkflow: (threadId) =>
				set((state) => {
					const { [threadId]: _, ...rest } = state.workflowsByThread;
					return { workflowsByThread: rest };
				}),
		}),
		{ name: "aevryn-workflows" },
	),
);
