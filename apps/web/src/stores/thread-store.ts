import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Thread {
	id: string;
	objective: string;
	status: string;
	createdAt: string;
	updatedAt?: string;
}

interface ThreadState {
	threads: Thread[];
	activeThreadId: string | null;
	setThreads: (threads: Thread[]) => void;
	addThread: (thread: Thread) => void;
	updateThread: (id: string, updates: Partial<Thread>) => void;
	removeThread: (id: string) => void;
	setActiveThread: (id: string | null) => void;
}

export const useThreadStore = create<ThreadState>()(
	persist(
		(set) => ({
			threads: [],
			activeThreadId: null,
			setThreads: (threads) => set({ threads }),
			addThread: (thread) =>
				set((state) => ({
					threads: [thread, ...state.threads.filter((t) => t.id !== thread.id)],
				})),
			updateThread: (id, updates) =>
				set((state) => ({
					threads: state.threads.map((t) =>
						t.id === id ? { ...t, ...updates } : t,
					),
				})),
			removeThread: (id) =>
				set((state) => ({
					threads: state.threads.filter((t) => t.id !== id),
					activeThreadId:
						state.activeThreadId === id ? null : state.activeThreadId,
				})),
			setActiveThread: (id) => set({ activeThreadId: id }),
		}),
		{ name: "aevryn-threads" },
	),
);
