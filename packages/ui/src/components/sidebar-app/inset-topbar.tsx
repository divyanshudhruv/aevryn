"use client";

import { SidebarTrigger, useSidebar } from "@aevryn/ui/components/ui/sidebar";
import { cn } from "@aevryn/ui/lib/utils";
import type { ReactNode } from "react";

export function SidebarInsetTopbar({
	children,
	className,
}: {
	children?: ReactNode;
	className?: string;
}) {
	const { isPeeking } = useSidebar();
	return (
		<header
			className={cn("flex h-12 shrink-0 items-center gap-2 px-1.5", className)}
		>
			<SidebarTrigger
				className={`transition-opacity delay-200 duration-160 ${
					isPeeking ? "opacity-0" : "opacity-100"
				}`}
			/>
			{children}
		</header>
	);
}
