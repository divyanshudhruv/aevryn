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

// ---------------------------------------------------------------------------
// A settings dialog: the `xl` Dialog as a canvas, a non-collapsing Sidebar
// of sections down its left edge, and a scrolling panel for the section's
// controls. The sidebar is the same composable Sidebar the app shell uses —
// it just lives in a bounded frame: `collapsible="none"` drops the rail and
// the drawer, the provider is told not to persist or listen for the
// shortcut, and `h-full` pins both to the dialog's fixed height.
//
// Below the `sm` breakpoint the column would leave no room for the panel,
// so it hides and a Select at the top of the panel takes over navigation.
// ---------------------------------------------------------------------------

interface SettingsSection {
	id: SettingsSectionId;
	label: string;
	icon: IconName;
	description: string;
}

const SECTIONS: SettingsSection[] = [
	{
		id: "workspace",
		label: "Workspace",
		icon: "folder",
		description: "Name, default home, and workspace-wide behavior.",
	},
	{
		id: "models",
		label: "Models",
		icon: "bot",
		description: "Model providers and API keys that power the agent.",
	},
	{
		id: "byok",
		label: "API keys",
		icon: "key",
		description: "Anakin and Mem0 keys — encrypted at rest.",
	},
	{
		id: "notifications",
		label: "Notifications",
		icon: "bell",
		description: "What reaches your inbox and the notification bell.",
	},
	{
		id: "appearance",
		label: "Appearance",
		icon: "palette",
		description: "Theme, density, and how the UI breathes.",
	},
	{
		id: "security",
		label: "Security",
		icon: "shield",
		description: "Sign-in alerts and active sessions.",
	},
];

export interface SettingsDialogProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** The section shown first. @default "general" */
	defaultSection?: SettingsSectionId;
	/** The active workspace, for the workspace settings panel. */
	workspace?: { id: string; name: string; isDefault: boolean };
	/** Called after a rename or delete so the shell can refresh its data. */
	onWorkspaceMutated?: () => void;
}

export function SettingsDialog({
	open,
	defaultOpen,
	onOpenChange,
	defaultSection = "workspace",
	workspace,
	onWorkspaceMutated,
}: SettingsDialogProps) {
	const icons = useIcons();
	const [section, setSection] = useState<SettingsSectionId>(defaultSection);
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
								Settings
							</DialogTitle>
							<DialogDescription className="sr-only">
								Workspace and account settings.
							</DialogDescription>
						</SidebarHeader>
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupLabel>Settings</SidebarGroupLabel>
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
									Settings
								</h2>
								<Select
									value={section}
									onValueChange={(value: string) =>
										setSection(value as SettingsSectionId)
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
									<SettingsSectionPanel
										id={current.id}
										workspace={workspace}
										onWorkspaceMutated={onWorkspaceMutated}
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

import {
	type SettingsSectionId,
	SettingsSectionPanel,
} from "./settings-sections";
