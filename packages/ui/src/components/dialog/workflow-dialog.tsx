"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@aevryn/ui/components/ui/dialog";
import { ScrollArea } from "@aevryn/ui/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@aevryn/ui/components/ui/select";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";
import { fontWeights } from "@aevryn/ui/lib/font-weight";
import { type IconName, useIcons } from "@aevryn/ui/lib/icon-context";
import { useState } from "react";

type WorkflowSectionId = "general" | "plan" | "instructions" | "memories";

interface WorkflowSection {
	id: WorkflowSectionId;
	label: string;
	icon: IconName;
	description: string;
}

const SECTIONS: WorkflowSection[] = [
	{
		id: "general",
		label: "General",
		icon: "settings",
		description: "Name, description, and how this workflow behaves by default.",
	},
	{
		id: "plan",
		label: "Plan",
		icon: "notebook",
		description: "The steps this workflow follows, in order.",
	},
	{
		id: "instructions",
		label: "Instructions",
		icon: "bot",
		description: "System prompt and instructions the agent follows.",
	},
	{
		id: "memories",
		label: "Memories",
		icon: "database",
		description: "Context this workflow can use across threads.",
	},
];

export interface WorkflowDialogProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultSection?: WorkflowSectionId;
	workflowId?: string | null;
	threadId?: string | null;
	onWorkflowDeleted?: () => void;
}

export function WorkflowDialog({
	open,
	defaultOpen,
	onOpenChange,
	defaultSection = "general",
	workflowId = null,
	threadId = null,
	onWorkflowDeleted,
}: WorkflowDialogProps) {
	const icons = useIcons();
	const [section, setSection] = useState<WorkflowSectionId>(defaultSection);
	const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

	return (
		<Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
			<DialogContent
				size="xl"
				className="flex h-[min(640px,calc(100dvh-4rem))] overflow-hidden p-0"
			>
				<SidebarProvider
					persist={false}
					shortcut={null}
					width="13rem"
					className="h-full min-h-0"
				>
					<Sidebar
						collapsible="none"
						className="hidden h-full bg-[rgb(var(--overlay)/0.03)] sm:flex"
					>
						<SidebarHeader className="px-4 pt-5 pb-2">
							<DialogTitle
								style={{ fontVariationSettings: fontWeights.normal }}
							>
								Workflow
							</DialogTitle>
							<DialogDescription className="sr-only">
								Workflow settings, memories, and instructions.
							</DialogDescription>
						</SidebarHeader>
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupLabel>Workflow</SidebarGroupLabel>
								<SidebarMenu focusRing={false} className="gap-px">
									{SECTIONS.map((s) => (
										<SidebarMenuItem key={s.id}>
											<SidebarMenuButton
												icon={icons[s.icon]}
												isActive={s.id === section}
												onClick={() => setSection(s.id)}
											>
												{s.label}
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroup>
						</SidebarContent>
					</Sidebar>

					<div className="flex min-w-0 flex-1 flex-col">
						<div className="flex shrink-0 flex-col gap-1 px-6 pt-5 pr-12 pb-4">
							<div className="sm:hidden">
								<h2
									className="mb-3 text-[16px] text-foreground leading-tight"
									style={{ fontVariationSettings: fontWeights.normal }}
								>
									Workflow
								</h2>
								<Select
									value={section}
									onValueChange={(value: string) =>
										setSection(value as WorkflowSectionId)
									}
								>
									<SelectTrigger placeholder="Section" />
									<SelectContent>
										{SECTIONS.map((s, i) => (
											<SelectItem
												key={s.id}
												index={i}
												value={s.id}
												icon={icons[s.icon]}
											>
												{s.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<h3
								className="hidden text-[16px] text-foreground leading-tight sm:block"
								style={{ fontVariationSettings: fontWeights.normal }}
							>
								{current?.label}
							</h3>
							<p className="hidden text-[13px] text-muted-foreground sm:block">
								{current?.description}
							</p>
						</div>
						<ScrollArea className="min-h-0 flex-1">
							<div className="flex flex-col gap-6 px-6 pb-6">
								{current && (
									<WorkflowSectionPanel
										id={current.id}
										workflowId={workflowId}
										threadId={threadId}
										onDeleted={onWorkflowDeleted}
									/>
								)}
							</div>
						</ScrollArea>
					</div>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}

import { WorkflowSectionPanel } from "./workflow-sections";
