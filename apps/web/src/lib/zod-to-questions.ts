import type { AskUserQuestion } from "@aevryn/ui/components/ui/ask-user-questions";

/** Adapt a single zod-declared askUserQuestion tool payload into the
 *  AskUserQuestions component's question shape. */
export function fromZodToAskUserQuestions(
	q: Record<string, unknown>,
): AskUserQuestion[] {
	const options = Array.isArray(q.options)
		? q.options.map((o, i) => ({
				id: (o as { id?: string }).id ?? `o-${i}`,
				title: (o as { title: string }).title,
				description: (o as { description?: string }).description,
			}))
		: [];
	return [
		{
			id: (q.id as string) ?? "q-0",
			title: (q.title as string) ?? "Question",
			options: (q.freeText as boolean) ? undefined : options,
			multiSelect: q.multiSelect as boolean,
			allowOther: q.allowOther as boolean,
			otherPlaceholder: q.otherPlaceholder as string,
			freeText: q.freeText as boolean,
			freeTextPlaceholder: q.freeTextPlaceholder as string,
			skippable: q.skippable as boolean,
			nextLabel: q.nextLabel as string,
		},
	];
}