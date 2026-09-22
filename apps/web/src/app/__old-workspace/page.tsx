"use client";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { WorkflowDialog } from "@aevryn/ui/components/dialog/workflow-dialog";
import { SearchableDropdown } from "@aevryn/ui/components/header/searchable-dropdown";
import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import { AppSidebar } from "@aevryn/ui/components/sidebar-preset/app-sidebar";
import {
	AccordionContent,
	AccordionGroup,
	AccordionItem,
	AccordionTrigger,
} from "@aevryn/ui/components/ui/accordion";
import type { AskUserQuestion } from "@aevryn/ui/components/ui/ask-user-questions";
import { Button } from "@aevryn/ui/components/ui/button";
import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";
import InputGroup, { InputField } from "@aevryn/ui/components/ui/input-group";
import {
	SidebarInset,
	SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@aevryn/ui/components/ui/table";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { CopyIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import {
	CompilingAgent,
	FinalAnswerStep,
	ResearchAgent,
	WebScrapeAgent,
} from "@/components/workspace/tool-step-calls";

export default function WorkspacePage() {
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

	const workflowApproval: AskUserQuestion[] = [
		{
			id: "role",
			title: "Do you want to approve this workflow?",
			layout: "stacked",
			multiSelect: false,
			allowOther: true,
			otherPlaceholder: "Something else?",
			options: [
				{
					id: "approve",
					title: "Approve",
					description: "Approve this workflow and move forward with it.",
				},
				{
					id: "decline",
					title: "Decline",
					description: "Decline this workflow and provide feedback.",
				},
				{
					id: "bing",
					title: "Bind",
					description:
						"Review this workflow later, but bind it to this thread.",
				},
				{
					id: "request-changes",
					title: "Request changes",
					description: "Request changes to this workflow.",
				},
			],
		},
	];
	const items = [
		{
			value: "item-1",
			title: "Outline project scope and goals",
			content:
				"Define the purpose and objectives of the project. Identify the key stakeholders and their roles. Determine the project timeline and milestones.",
		},
		{
			value: "item-2",
			title: "Gather requirements and conduct user research",
			content:
				"Collaborate with stakeholders to gather project requirements. Conduct user research to understand user needs and preferences. Create a user persona and user journey map.",
		},
		{
			value: "item-3",
			title: "Design the project plan and wireframes",
			content:
				"Create a detailed project plan, including task assignments, timelines, and dependencies. Design wireframes to visualize the project's user interface.",
		},
		{
			value: "item-4",
			title: "Develop the project codebase",
			content:
				"Write clean, modular, and testable code. Implement the project's features and functionality. Test the code thoroughly to ensure quality and reliability.",
		},
		{
			value: "item-5",
			title: "Deploy the project and conduct testing",
			content:
				"Deploy the project to a production environment. Conduct thorough testing to ensure compatibility and performance. Fix any bugs or issues identified during testing.",
		},
		{
			value: "item-6",
			title: "Launch the project and provide ongoing support",
			content:
				"Launch the project to users. Provide ongoing support and maintenance to ensure smooth operation and bug fixes. Continuously gather feedback and improve the project over time.",
		},
	];

	const play = useIcon("play");
	const gear = useIcon("sliders-horizontal");
	const [open, setOpen] = useState(false);

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<WorkflowDialog open={open} onOpenChange={setOpen} />
				<div className="flex h-full min-h-0 flex-col">
					<header className="flex h-12 shrink-0 items-center px-4">
						<div className="flex w-full flex-row items-center justify-between">
							<div className="flex flex-row items-center gap-px">
								<SearchableDropdown />
								<InputGroup className="mb-1">
									<InputField
										index={0}
										className="truncate"
										label=""
										id="name of the workflow, can be renamed on typing and when onfocus changes"
										placeholder=""
										value={
											"Compare prices of Framework Laptop 16 and Apple Macbook"
										}
										onChange={() => {}}
									/>
								</InputGroup>
							</div>

							<div className="flex flex-row items-center gap-2">
								<Button variant="ghost" leadingIcon={play}>
									Run
								</Button>

								<Button leadingIcon={gear} onClick={() => setOpen(true)}>
									Settings
								</Button>
							</div>
						</div>
					</header>

					<section
						aria-label="Conversation"
						className="min-h-0 flex-1 overflow-y-auto"
					>
						<div className="mx-auto flex min-h-full max-w-3xl flex-col">
							<div className="flex-1 p-4">
								<div className="flex flex-col gap-2">
									<ChatMessage
										from="user"
										time="Wednesday 6:06 PM"
										actions={actions}
									>
										Hi who are you an what can you do
									</ChatMessage>
									<ChatMessage
										from="assistant"
										actions={actions}
										time="Wednesday 6:06 PM"
									>
										Good design. I am Aevryn, your AI assistant. I can help you
										with a variety of tasks, including answering questions,
										helping you with your work, and more.
									</ChatMessage>
									<ChatMessage
										from="user"
										time="Wednesday 6:07 PM"
										actions={actions}
									>
										What all tools, do you have?
									</ChatMessage>
									<ChatMessage
										from="assistant"
										actions={actions}
										time="Wednesday 6:07 PM"
									>
										<div className="flex w-full flex-col gap-5">
											<p>
												I have a variety of tools at my disposal, including web
												search, file reading, and more. I can help you with a
												variety of tasks, including answering questions, helping
												you with your work, and more.
											</p>
											<div className="flex flex-col gap-1">
												<ResearchAgent />{" "}
											</div>
										</div>
									</ChatMessage>
									<ChatMessage
										from="user"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										Okay, I want to create a workflow for this thread in which
										you will find the best options for me.
									</ChatMessage>
									<ChatMessage
										from="assistant"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										<div className="flex w-full flex-col gap-5">
											<QuestionFlow
												className="flex w-full flex-col"
												questions={questions}
											/>
											<p>
												Sure, can you mind filling in the details so that I can
												verify and create the exact cuztomizable workflow?
											</p>
										</div>
									</ChatMessage>
									<SystemMessage fill={true} className="mb-[40px]">
										<p>Questions filled and submitted by the user</p>
									</SystemMessage>
									<ChatMessage
										from="assistant"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										<div className="flex w-full flex-col gap-5">
											<p>
												Okay, I will bind the workflow soon with this thread,
												and here's the final view of the workflow addition for
												you.
											</p>
											<AccordionGroup
												type="single"
												className="w-full"
												collapsible
												defaultValue="item-1"
											>
												{items.map((item, i) => (
													<AccordionItem
														key={item.value}
														value={item.value}
														index={i}
													>
														<AccordionTrigger>{item.title}</AccordionTrigger>
														<AccordionContent>{item.content}</AccordionContent>
													</AccordionItem>
												))}
											</AccordionGroup>

											<QuestionFlow
												className="w-full max-w-full"
												questions={workflowApproval}
											/>
										</div>
									</ChatMessage>
									<SystemMessage fill={true} className="mb-[40px]">
										<p>Questions filled and submitted by the user</p>
									</SystemMessage>

									<ChatMessage
										from="assistant"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										<div className="flex w-full flex-col gap-5">
											<p>
												Alright, I'll run the workflow now. Starting with
												research and event...
											</p>
											<div className="flex flex-col gap-1">
												<ResearchAgent /> {}
												<WebScrapeAgent />
												<CompilingAgent />
												<FinalAnswerStep />
											</div>{" "}
											<p>
												Based on the research, it seems like the Framework
												Laptop 16 is a great choice. It has a good balance of
												performance and affordability, and its repairability is
												a great plus.
											</p>
										</div>
									</ChatMessage>
									<SystemMessage
										fill={true}
										className="mb-[40px]"
										variant="warning"
									>
										<p>
											Cron job scheduled to run every 2 hours. Going to sleeping
											state.
										</p>
									</SystemMessage>
									<ChatMessage
										from="user"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										Thanks! Lastly, can you tell me the difference between these
										2 laptops and it's specifications, probably in a table
										format?
									</ChatMessage>

									<ChatMessage
										from="assistant"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										<div className="flex w-full flex-col gap-5">
											<p>
												Here you go, the differences between the two laptops and
												their specifications:
											</p>
											<Table className="min-w-100">
												<TableHeader>
													<TableRow>
														<TableHead>Laptop</TableHead>
														<TableHead>CPU</TableHead>
														<TableHead>GPU</TableHead>
														<TableHead>Memory</TableHead>
														<TableHead>Storage</TableHead>
														<TableHead>Display</TableHead>
														<TableHead>Battery</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													<TableRow index={0}>
														<TableCell>Framework Laptop 16</TableCell>
														<TableCell>Intel Core i5</TableCell>
														<TableCell>NVIDIA GeForce MX250</TableCell>
														<TableCell>8GB</TableCell>
														<TableCell>256GB SSD</TableCell>
														<TableCell>14 inch</TableCell>
														<TableCell>8 hours</TableCell>
													</TableRow>
													<TableRow index={1}>
														<TableCell>Dell XPS 13</TableCell>
														<TableCell>Intel Core i7</TableCell>
														<TableCell>NVIDIA GeForce GTX 1050 Ti</TableCell>
														<TableCell>16GB</TableCell>
														<TableCell>512GB SSD</TableCell>
														<TableCell>13.3 inch</TableCell>
														<TableCell>10 hours</TableCell>
													</TableRow>
												</TableBody>
											</Table>
										</div>
									</ChatMessage>
									<ChatMessage
										from="user"
										time="Wednesday 6:08 PM"
										actions={actions}
									>
										Thankyou, now save this to your memory, got it ?
									</ChatMessage>
									<ChatMessage from="assistant">
										<ThinkingIndicator />
									</ChatMessage>

									<SystemMessage
										fill={true}
										className="mb-[40px]"
										variant="warning"
									>
										<p>Starting the scheduled cron job.</p>
									</SystemMessage>

									<ChatMessage
										from="assistant"
										time="Wednesday 8:10 PM"
										actions={actions}
									>
										<div className="flex w-full flex-col gap-5">
											<p>Running the scheduled workflow again.</p>
											<div className="flex flex-col gap-1">
												<ResearchAgent /> {}
												<WebScrapeAgent />
												<CompilingAgent />
												<FinalAnswerStep />
											</div>{" "}
											<p>
												Based on the research, it again seems like the Framework
												Laptop 16 is a great choice. It has a good balance of
												performance and affordability, and its repairability is
												a great plus. As I said earlier.
											</p>
										</div>
									</ChatMessage>
									<SystemMessage
										fill={true}
										className="mb-[40px]"
										variant="warning"
									>
										<p>
											Cron job scheduled to run every 2 hours. Going to sleeping
											state.
										</p>
									</SystemMessage>
								</div>
							</div>
						</div>
					</section>

					<footer className="shrink-0 p-3">
						<div className="mx-auto max-w-3xl">
							<ChatComposer />
						</div>
					</footer>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

const actions = (
	<>
		<button
			aria-label="Copy"
			className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
		>
			<CopyIcon size={13} strokeWidth={1.5} />
		</button>
		<button
			aria-label="Regenerate"
			className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
		>
			<RotateCcwIcon size={13} strokeWidth={1.5} />
		</button>
	</>
);
