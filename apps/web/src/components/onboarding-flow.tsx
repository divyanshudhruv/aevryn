"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import questionsJson from "@/onboarding/questions.json";
import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import type { AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";
import type { AskUserQuestion } from "@aevryn/ui/components/ui/ask-user-questions";

const ONBOARDING_QUESTIONS = questionsJson.questions as AskUserQuestion[];

export function OnboardingFlow() {
	const router = useRouter();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleComplete(answers: Record<string, AskUserAnswer>) {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/onboarding", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ answers }),
			});
			if (!res.ok) throw new Error("Failed to save answers");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes doesn't know the dynamic redirect
			router.push("/workspace" as any);
		} catch {
			setError("Something went wrong saving your answers. Try again.");
			setSaving(false);
		}
	}

	if (saving) {
		return (
			<p className="text-sm text-muted-foreground">
				Saving your answers… One moment.
			</p>
		);
	}

	return (
		<div>
			{error && (
				<p className="mb-4 text-sm text-red-500" role="alert">
					{error}
				</p>
			)}
			<QuestionFlow questions={ONBOARDING_QUESTIONS} onComplete={handleComplete} />
		</div>
	);
}