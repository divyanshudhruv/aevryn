import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ApprovalRequest {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	workflowId: string;
	executionId: string;
	createdAt: string;
}

interface UIState {
	composerDisabled: boolean;
	setComposerDisabled: (disabled: boolean) => void;
	activeApproval: ApprovalRequest | null;
	setActiveApproval: (approval: ApprovalRequest | null) => void;
	expandedSteps: Record<string, boolean>;
	toggleStepExpanded: (stepId: string) => void;
	setStepExpanded: (stepId: string, expanded: boolean) => void;
	sidebarOpen: boolean;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
			composerDisabled: false,
			setComposerDisabled: (disabled) => set({ composerDisabled: disabled }),
			activeApproval: null,
			setActiveApproval: (approval) =>
				set({ activeApproval: approval, composerDisabled: !!approval }),
			expandedSteps: {},
			toggleStepExpanded: (stepId) =>
				set((state) => ({
					expandedSteps: {
						...state.expandedSteps,
						[stepId]: !state.expandedSteps[stepId],
					},
				})),
			setStepExpanded: (stepId, expanded) =>
				set((state) => ({
					expandedSteps: { ...state.expandedSteps, [stepId]: expanded },
				})),
			sidebarOpen: true,
			toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
			setSidebarOpen: (open) => set({ sidebarOpen: open }),
		}),
		{ name: "aevryn-ui" },
	),
);
