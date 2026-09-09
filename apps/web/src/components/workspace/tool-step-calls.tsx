"use client";

import {
  ThinkingStep,
  ThinkingStepImage,
  ThinkingStepSources,
  ThinkingStepSource,
  ThinkingSteps,
  ThinkingStepsContent,
  ThinkingStepsHeader,
  ThinkingStepDetails,
} from "@aevryn/ui/components/ui/thinking-steps";
import { useState } from "react";

export function ResearchAgent() {
  const [open, setOpen] = useState(true);

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen}>
      <ThinkingStepsHeader>Research Agent</ThinkingStepsHeader>
      <ThinkingStepsContent>
        <ThinkingStep icon="search" label="Searching profiles" isLast={false}>
          <ThinkingStepSources>
            <ThinkingStepSource>x.com</ThinkingStepSource>
            <ThinkingStepSource>instagram.com</ThinkingStepSource>
            <ThinkingStepSource>github.com</ThinkingStepSource>
          </ThinkingStepSources>
        </ThinkingStep>
        <ThinkingStep
          icon="image"
          label="Found profile photo"
          description="micka.design profile from x.com"
          isLast={false}
        >
          <ThinkingStepImage src="/og.gif" caption="Profile card" />
        </ThinkingStep>
        <ThinkingStep icon="globe" label="Reading portfolio" isLast>
          <ThinkingStepDetails
            summary="Explored 4 pages"
            details={[
              "Read about.html",
              "Read projects.html",
              "Read resume.pdf",
              "Read contact.html",
            ]}
          />
        </ThinkingStep>
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

export function WebScrapeAgent() {
  const [open, setOpen] = useState(true);

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen}>
      <ThinkingStepsHeader>Web Scrape Agent</ThinkingStepsHeader>
      <ThinkingStepsContent>
        <ThinkingStep icon="search" label="Scraping product pages" isLast={false}>
          <ThinkingStepSources>
            <ThinkingStepSource>framework.gg</ThinkingStepSource>
            <ThinkingStepSource>apple.com</ThinkingStepSource>
          </ThinkingStepSources>
        </ThinkingStep>
        <ThinkingStep icon="globe" label="Extracting prices and specs" isLast>
          <ThinkingStepDetails
            summary="Collected 2 product pages"
            details={[
              "Framework Laptop 16 — $1,699",
              "MacBook Pro 16 — $2,499",
            ]}
          />
        </ThinkingStep>
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

export function CompilingAgent() {
  const [open, setOpen] = useState(true);

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen}>
      <ThinkingStepsHeader>Compiling Agent</ThinkingStepsHeader>
      <ThinkingStepsContent>
        <ThinkingStep icon="brain" label="Comparing specs and prices" isLast={false}>
          <ThinkingStepDetails
            summary="Normalized 6 data points"
            details={[
              "CPU: Ryzen 7 7840HS vs M3 Pro",
              "Storage: 512 GB vs 512 GB",
              "Battery: 85 Wh vs 100 Wh",
            ]}
          />
        </ThinkingStep>
        <ThinkingStep icon="brain" label="Ranking by price-per-performance" isLast />
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}

export function FinalAnswerStep() {
  const [open, setOpen] = useState(true);

  return (
    <ThinkingSteps open={open} onOpenChange={setOpen}>
      <ThinkingStepsHeader>Final Answer</ThinkingStepsHeader>
      <ThinkingStepsContent>
        <ThinkingStep icon="check" label="Generating final answer" isLast />
      </ThinkingStepsContent>
    </ThinkingSteps>
  );
}