"use client";

import { create } from "zustand";

interface WorkspaceState {
		activeStepId: string | null;
		expandedNodes: Set<string>;

	setActiveStep: (stepId: string | null) => void;
	toggleNode: (nodeId: string) => void;
	expandNode: (nodeId: string) => void;
	collapseNode: (nodeId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
	activeStepId: null,
	expandedNodes: new Set<string>(),

	setActiveStep: (stepId) => set({ activeStepId: stepId }),

	toggleNode: (nodeId) =>
		set((state) => {
			const expandedNodes = new Set(state.expandedNodes);
			if (expandedNodes.has(nodeId)) {
				expandedNodes.delete(nodeId);
			} else {
				expandedNodes.add(nodeId);
			}
			return { expandedNodes };
		}),

	expandNode: (nodeId) =>
		set((state) => {
			if (state.expandedNodes.has(nodeId)) return state;
			return { expandedNodes: new Set(state.expandedNodes).add(nodeId) };
		}),

	collapseNode: (nodeId) =>
		set((state) => {
			if (!state.expandedNodes.has(nodeId)) return state;
			const expandedNodes = new Set(state.expandedNodes);
			expandedNodes.delete(nodeId);
			return { expandedNodes };
		}),
}));
