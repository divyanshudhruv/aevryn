"use client";

import { AskUserQuestions } from "@aevryn/ui/components/ui/ask-user-questions";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";
import { summarizeArgs } from "@aevryn/ui/components/tool-step-card";
import { useMemo, useState } from "react";

import { fromZodToAskUserQuestions } from "@/lib/zod-to-questions";

interface ClientToolInvocation {
	type: string;
	toolName?: string;
	state: string;
	args?: unknown;
	input?: unknown;
	output?: unknown;
}

function toolNameOf(invocation: ClientToolInvocation): string {
	if (invocation.toolName) return invocation.toolName;
	const t = invocation.type;
	return t.startsWith("tool-") ? t.slice("tool-".length) : t;
}

/**
 * Client renderer for the backend's persisted tool invocations. The backend
 * executes tools instantly (nothing pauses the stream); interactive tools
 * return a payload that this component renders, and answers are submitted as
 * a follow-up user message via resubmitAnswers.
 */
export function ToolCallRenderer({
	invocation,
	onResubmitAnswers,
}: {
	invocation: ClientToolInvocation;
	onResubmitAnswers: (answers: Record<string, unknown>) => void;
}) {
	const name = toolNameOf(invocation);
	const [answered, setAnswered] = useState(false);
	const args = invocation.input ?? invocation.args;

	const payload: { kind: "question"; question: Record<string, unknown> } | null =
		useMemo(() => {
			if (!args || typeof args !== "object") return null;
			const obj = args as Record<string, unknown>;
			if (name === "askUserQuestion") {
				const q = obj.question as Record<string, unknown> | undefined;
				if (q) return { kind: "question", question: q };
			}
			return null;
		}, [args, name]);

	if (invocation.state === "input-streaming") {
		return (
			<SystemMessage variant="action" fill={false} icon={null}>
				{name}…
			</SystemMessage>
		);
	}

	if (invocation.state === "error") {
		return (
			<SystemMessage variant="error" fill={false} icon={null}>
				Something went wrong in {name}.
			</SystemMessage>
		);
	}

	if (answered) {
		return (
			<SystemMessage variant="action" fill={false} icon={null}>
				Answers submitted
			</SystemMessage>
		);
	}

	if (payload?.kind === "question") {
		return (
			<div className="py-1.5">
				<AskUserQuestions
					questions={fromZodToAskUserQuestions(payload.question)}
					onComplete={(answers) => {
						setAnswered(true);
						onResubmitAnswers(answers);
					}}
				/>
			</div>
		);
	}

	return (
		<SystemMessage variant="action" fill={false} icon={null}>
			{name}
			{args
				? ` · ${summarizeArgs(args as Record<string, unknown>)}`
				: ""}
		</SystemMessage>
	);
}