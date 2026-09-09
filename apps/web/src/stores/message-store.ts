import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface StepCall {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	status: "running" | "completed" | "failed";
	output?: string;
	startedAt: string;
	completedAt?: string;
}

export interface Message {
	id: string;
	threadId: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
	toolCalls?: StepCall[];
	approvalPending?: boolean;
}

interface MessageState {
	messagesByThread: Record<string, Message[]>;
	getMessages: (threadId: string) => Message[];
	setMessages: (threadId: string, messages: Message[]) => void;
	appendMessage: (threadId: string, message: Message) => void;
	updateMessage: (
		threadId: string,
		messageId: string,
		updates: Partial<Message>,
	) => void;
	addStepCall: (
		threadId: string,
		messageId: string,
		step: StepCall,
	) => void;
	updateStepCall: (
		threadId: string,
		messageId: string,
		stepId: string,
		updates: Partial<StepCall>,
	) => void;
	clearThread: (threadId: string) => void;
}

export const useMessageStore = create<MessageState>()(
	persist(
		(set, get) => ({
			messagesByThread: {},
			getMessages: (threadId) => get().messagesByThread[threadId] ?? [],
			setMessages: (threadId, messages) =>
				set((state) => ({
					messagesByThread: {
						...state.messagesByThread,
						[threadId]: messages,
					},
				})),
			appendMessage: (threadId, message) =>
				set((state) => ({
					messagesByThread: {
						...state.messagesByThread,
						[threadId]: [
							...(state.messagesByThread[threadId] ?? []),
							message,
						],
					},
				})),
			updateMessage: (threadId, messageId, updates) =>
				set((state) => ({
					messagesByThread: {
						...state.messagesByThread,
						[threadId]: (state.messagesByThread[threadId] ?? []).map(
							(m) => (m.id === messageId ? { ...m, ...updates } : m),
						),
					},
				})),
			addStepCall: (threadId, messageId, step) =>
				set((state) => ({
					messagesByThread: {
						...state.messagesByThread,
						[threadId]: (state.messagesByThread[threadId] ?? []).map((m) =>
							m.id === messageId
								? { ...m, toolCalls: [...(m.toolCalls ?? []), step] }
								: m,
						),
					},
				})),
			updateStepCall: (threadId, messageId, stepId, updates) =>
				set((state) => ({
					messagesByThread: {
						...state.messagesByThread,
						[threadId]: (state.messagesByThread[threadId] ?? []).map((m) =>
							m.id === messageId
								? {
										...m,
										toolCalls: (m.toolCalls ?? []).map((s) =>
											s.id === stepId ? { ...s, ...updates } : s,
										),
									}
								: m,
						),
					},
				})),
			clearThread: (threadId) =>
				set((state) => {
					const { [threadId]: _, ...rest } = state.messagesByThread;
					return { messagesByThread: rest };
				}),
		}),
		{ name: "aevryn-messages" },
	),
);
