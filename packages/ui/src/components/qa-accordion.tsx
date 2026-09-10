"use client";

import type { ReactNode } from "react";

import {
  type AskUserAnswer,
  type AskUserQuestion,
} from "@aevryn/ui/components/ui/ask-user-questions";
import {
  AccordionContent,
  AccordionGroup,
  AccordionItem,
  AccordionTrigger,
} from "@aevryn/ui/components/ui/accordion";
import { cn } from "@aevryn/ui/lib/utils";

export interface QaItem {
  id: string;
  question: string;
  answer: ReactNode;
}

function optionTitle(q: AskUserQuestion, optionIndex: number, id: string): string {
  const options = q.options ?? [];
  const option = options.find((o) => (o.id ?? `o-${optionIndex}`) === id);
  return option?.title ?? id;
}

function formatAnswer(q: AskUserQuestion, answer: AskUserAnswer): string {
  if (answer.skipped) return "Skipped.";
  const selected = (answer.selectedIds ?? [])
    .map((id) => optionTitle(q, 0, id))
    .filter(Boolean);
  const other = answer.otherText?.trim();
  const text = [selected.join(", "), other].filter(Boolean).join(" — ");
  return text || "No answer.";
}

/** Maps a finished AskUserQuestions flow to question → answer pairs, one
 *  accordion item per question (trigger = question, content = answer). */
export function buildQaItems(
  questions: AskUserQuestion[],
  answers: Record<string, AskUserAnswer>,
  filter?: string[],
): QaItem[] {
  const items: QaItem[] = [];
  questions.forEach((q, i) => {
    if (!q) return;
    const id = q.id ?? `q-${i}`;
    if (filter && !filter.includes(id)) return;
    const answer = answers[id];
    items.push({
      id,
      question: q.title,
      answer: answer ? formatAnswer(q, answer) : "No answer.",
    });
  });
  return items;
}

interface QaAccordionProps {
  items: QaItem[];
  className?: string;
}

/** Expanded list of question → answer pairs. One accordion item per question,
 *  title is the question, the answer sits in the content. */
export function QaAccordion({ items, className }: QaAccordionProps) {
  if (items.length === 0) return null;
  return (
    <AccordionGroup
      type="single"
      collapsible
      defaultValue={items[0]?.id}
      className={cn("w-full self-start", className)}
    >
      {items.map((item, i) => (
        <AccordionItem key={item.id} value={item.id} index={i}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </AccordionGroup>
  );
}

export default QaAccordion;