import { z } from "zod";

export const askUserOptionSchema = z.object({
	id: z.string().optional(),
	title: z.string().min(1),
	description: z.string().optional(),
});

export const askUserQuestionSchema = z.object({
	question: z.object({
		id: z.string().optional(),
		title: z.string().min(1),
		options: z.array(askUserOptionSchema).min(2).max(5).optional(),
		multiSelect: z.boolean().optional(),
		allowOther: z.boolean().optional(),
		otherPlaceholder: z.string().optional(),
		freeText: z.boolean().optional(),
		freeTextPlaceholder: z.string().optional(),
		skippable: z.boolean().optional(),
		nextLabel: z.string().optional(),
	}),
});
export type AskUserQuestionInput = z.infer<typeof askUserQuestionSchema>;

export const showPlanSchema = z.object({
	planTitle: z.string().min(1),
	summary: z.string().min(1),
	steps: z.array(z.string().min(1)).min(1),
});
export type ShowPlanInput = z.infer<typeof showPlanSchema>;

export const finalizeWorkflowSchema = z.object({
	title: z.string().min(1),
	objective: z.string().min(1),
	summary: z.string().min(1),
	steps: z.array(z.string().min(1)).min(1),
	notes: z.array(z.string()).optional(),
});
export type FinalizeWorkflowInput = z.infer<typeof finalizeWorkflowSchema>;

export const chatToolNames = [
	"askUserQuestion",
	"showPlan",
	"finalizeAndInject",
] as const;
export type ChatToolName = (typeof chatToolNames)[number];