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
} from "@aevryn/ui/components/ui/sidebar";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { SIDEBAR_MENU_POPUP } from "@aevryn/ui/lib/sidebar-menu-grid";
import { useSize } from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import type { ReactNode } from "react";

export interface SidebarUserFooterProps {
	name: ReactNode;
	avatar: ReactNode;
	menu: ReactNode;
	className?: string;
}

export function SidebarUserFooter({
	name,
	avatar,
	menu,
	className,
}: SidebarUserFooterProps) {
	const iconSize = useSize().icon;
	const ChevronsUpDown = useIcon("chevrons-up-down");
	return (
		<SidebarMenu aria-label="User" className={cn(className)}>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownTrigger
						render={
							<SidebarMenuButton aria-label="Open user menu">
								<span className="-mr-0.5 -ml-0.5 flex size-5 shrink-0 items-center justify-center">
									{avatar}
								</span>
								<span className="min-w-0 truncate text-[13px] text-foreground">
									{name}
								</span>
								<span className="-mr-0.5 ml-auto flex size-6 shrink-0 items-center justify-center">
									<ChevronsUpDown
										size={iconSize}
										strokeWidth={1.5}
										className="text-muted-foreground"
									/>
								</span>
							</SidebarMenuButton>
						}
					/>
					<DropdownContent
						className={SIDEBAR_MENU_POPUP}
						side="top"
						align="start"
						sideOffset={6}
					>
						{menu}
					</DropdownContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
