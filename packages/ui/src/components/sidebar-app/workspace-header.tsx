"use client";

import {
	DropdownContent,
	DropdownMenu,
	DropdownTrigger,
} from "@aevryn/ui/components/ui/dropdown";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarTrigger,
	useSidebar,
} from "@aevryn/ui/components/ui/sidebar";
import { fontWeights } from "@aevryn/ui/lib/font-weight";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { useShape } from "@aevryn/ui/lib/shape-context";
import { SIDEBAR_MENU_POPUP } from "@aevryn/ui/lib/sidebar-menu-grid";
import { useSize } from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import type { ReactNode } from "react";

export interface SidebarWorkspaceHeaderProps {
	name: ReactNode;
	tile: ReactNode;
	menu?: ReactNode;
	checkedIndex?: number;
}

export function SidebarWorkspaceHeader({
	name,
	tile,
	menu,
	checkedIndex,
}: SidebarWorkspaceHeaderProps) {
	const iconSize = useSize().icon;
	const ChevronDown = useIcon("chevron-down");
	const { isPeeking } = useSidebar();

	const tileSlot = (
		<span
			aria-hidden
			className={`pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 transition-opacity duration-80 ${
				isPeeking ? "opacity-0" : "opacity-100"
			}`}
		>
			{tile}
		</span>
	);
	const triggerFade = `[&>span:first-child]:hidden [&_svg]:size-4 transition-opacity duration-80 ${
		isPeeking ? "opacity-100" : "pointer-events-none opacity-0"
	}`;
	const nameSpan = (
		<span
			className="min-w-0 truncate text-[13px] text-foreground"
			style={{ fontVariationSettings: fontWeights.semibold }}
		>
			{name}
		</span>
	);

	if (!menu) {
		return (
			<div className="relative flex h-8 items-center pr-2 pl-8">
				<SidebarTrigger
					size="icon-compact"
					aria-hidden={!isPeeking || undefined}
					tabIndex={isPeeking ? undefined : -1}
					className={`absolute top-1/2 left-1 -translate-y-1/2 ${triggerFade}`}
				/>
				{tileSlot}
				{nameSpan}
			</div>
		);
	}
	return (
		<SidebarMenu aria-label="Workspace" className="@container">
			<SidebarMenuItem>
				<SidebarTrigger
					size="icon-compact"
					aria-hidden={!isPeeking || undefined}
					tabIndex={isPeeking ? undefined : -1}
					className={`absolute top-1/2 left-1 z-20 -translate-y-1/2 ${triggerFade}`}
				/>
				<DropdownMenu>
					<DropdownTrigger
						render={
							<SidebarMenuButton aria-label="Switch workspace" className="pl-8">
								{tileSlot}
								{nameSpan}
								<span className="ml-auto inline-flex @max-[7rem]:hidden">
									<ChevronDown
										size={iconSize}
										strokeWidth={1.5}
										className="text-muted-foreground"
									/>
								</span>
							</SidebarMenuButton>
						}
					/>
					{/* Trigger-width popup on the shared sidebar menu grid: items start
              at the row's edge, icon slots land on the leading axis, and the
              check sits on the chevron's vertical axis. */}
					<DropdownContent
						className={SIDEBAR_MENU_POPUP}
						align="start"
						sideOffset={4}
						checkedIndex={checkedIndex}
					>
						{menu}
					</DropdownContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

export function WorkspaceTile({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const shape = useShape();
	return (
		<span
			className={cn(
				"flex size-5 shrink-0 items-center justify-center bg-foreground text-[10px] text-background",
				shape.bgRadius >= 20 ? "rounded-full" : "rounded-md",
				className,
			)}
			style={{ fontVariationSettings: fontWeights.semibold }}
		>
			{children}
		</span>
	);
}
