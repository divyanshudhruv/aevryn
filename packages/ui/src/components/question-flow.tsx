"use client";

import { type ComponentProps } from "react";
import { AskUserQuestions, type AskUserQuestion } from "@aevryn/ui/components/ui/ask-user-questions";

// Generated from a fluidfunctionalism.com playground preset —
// swap the questions for your own.
const questions: AskUserQuestion[] = [
  {
    id: "role",
    title: "How do you plan to use Fluid Functionalism?",
    layout: "stacked",
    multiSelect: true,
    allowOther: true,
    otherPlaceholder: "Something else?",
    options: [
      {
        id: "design",
        title: "Designer",
        description:
          "Prototyping flows and pages fast, then handing the patterns to the team.",
      },
      {
        id: "eng",
        title: "Engineer",
        description:
          "Shipping production UI with springs and tokens instead of hand-rolled CSS.",
      },
      {
        id: "pm",
        title: "PM",
        description:
          "Aligning the team on one set of interaction patterns everyone can point to.",
      },
      {
        id: "founder",
        title: "Founder",
        description:
          "Bootstrapping a product that needs to look credible from day one.",
      },
    ],
  },
  {
    id: "drew",
    title: "What drew you to Fluid Functionalism?",
    layout: "stacked",
    multiSelect: true,
    allowOther: true,
    otherPlaceholder: "Something else?",
    options: [
      {
        id: "motion",
        title: "Motion",
        description:
          "Spring-driven motion that feels alive instead of scripted.",
      },
      {
        id: "craft",
        title: "Craft",
        description:
          "Pixel-level polish across typography, spacing, and focus states.",
      },
      {
        id: "tokens",
        title: "Tokens",
        description:
          "Shape and elevation systems that compose beyond single components.",
      },
    ],
  },
  {
    id: "recommend",
    title: "Would you recommend Fluid Functionalism to a teammate?",
    layout: "stacked",
    multiSelect: true,
    allowOther: true,
    otherPlaceholder: "Something else?",
    options: [
      {
        id: "yes",
        title: "Yes",
        description:
          "Already have — it sets the bar for polished React surfaces.",
      },
      {
        id: "soon",
        title: "Soon",
        description:
          "Once it covers more ground — a few primitives are still missing.",
      },
      {
        id: "unsure",
        title: "Not sure yet",
        description: "Still evaluating — one real flow will settle it.",
      },
    ],
  },
  {
    id: "goal",
    title: "Describe what you're hoping to build.",
    freeText: true,
    freeTextPlaceholder: "A sentence or two is plenty…",
  },
  {
    id: "feedback",
    title: "Anything else you'd like us to know?",
    freeText: true,
    skippable: false,
    nextLabel: "Finish",
  },
];

export function QuestionFlow(
  props: Omit<ComponentProps<typeof AskUserQuestions>, "questions">
) {
  return <AskUserQuestions questions={questions} {...props} />;
}
