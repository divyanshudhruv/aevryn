"use client";

import { SidebarInput } from "@aevryn/ui/components/ui/sidebar";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { useSize } from "@aevryn/ui/lib/size-context";
import type { ComponentProps } from "react";

export interface SidebarSearchFieldProps
	extends Omit<ComponentProps<typeof SidebarInput>, "className"> {
	shortcut?: string | null;
}

export function SidebarSearchField({
	placeholder = "Search…",
	shortcut = "",
	...props
}: SidebarSearchFieldProps) {
	const iconSize = useSize().icon;
	const SearchIcon = useIcon("search");
	return (
		<div className="group/search relative">
			<SearchIcon
				size={iconSize}
				strokeWidth={1.5}
				className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
			/>
			<SidebarInput
				placeholder={placeholder}
				aria-label="Search"
				className="pr-12 pl-8"
				{...props}
			/>
			{shortcut && (
				<kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-sans text-[11px] text-muted-foreground opacity-0 transition-opacity duration-80 group-focus-within/search:opacity-100 group-hover/search:opacity-100">
					{shortcut}
				</kbd>
			)}
		</div>
	);
}
