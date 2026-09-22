"use client";

// machinery adapted from Lina by SameerJS6 (https://lina.sameer.sh); built on

import { useTouchPrimary } from "@aevryn/ui/hooks/use-touch-primary";
import { useShape } from "@aevryn/ui/lib/shape-context";
import { cn } from "@aevryn/ui/lib/utils";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import {
	type ComponentPropsWithoutRef,
	type ComponentRef,
	createContext,
	forwardRef,
	useContext,
} from "react";

const ScrollAreaContext = createContext<boolean>(false);

type Orientation = "vertical" | "horizontal" | "both";

interface ScrollAreaProps extends ComponentPropsWithoutRef<"div"> {
	viewportClassName?: string;
	orientation?: Orientation;
}

const ScrollArea = forwardRef<
	ComponentRef<typeof ScrollAreaPrimitive.Root>,
	ScrollAreaProps
>(
	(
		{
			className,
			children,
			viewportClassName,
			orientation = "vertical",
			...props
		},
		ref,
	) => {
		const isTouch = useTouchPrimary();

		return (
			<ScrollAreaContext.Provider value={isTouch}>
				{isTouch ? (
					<div
						ref={ref}
						role="group"
						data-slot="scroll-area"
						aria-roledescription="scroll area"
						className={cn("relative overflow-hidden", className)}
						{...props}
					>
						<div
							data-slot="scroll-area-viewport"
							className={cn(
								"size-full rounded-[inherit]",
								orientation === "vertical" && "overflow-y-auto",
								orientation === "horizontal" && "overflow-x-auto",
								orientation === "both" && "overflow-auto",
								viewportClassName,
							)}
						>
							{children}
						</div>
					</div>
				) : (
					<ScrollAreaPrimitive.Root
						ref={ref}
						data-slot="scroll-area"
						className={cn("relative overflow-hidden", className)}
						{...props}
					>
						<ScrollAreaPrimitive.Viewport
							data-slot="scroll-area-viewport"
							className={cn("size-full rounded-[inherit]", viewportClassName)}
						>
							<ScrollAreaPrimitive.Content>
								{children}
							</ScrollAreaPrimitive.Content>
						</ScrollAreaPrimitive.Viewport>
						{orientation !== "horizontal" && (
							<ScrollBar orientation="vertical" />
						)}
						{orientation !== "vertical" && (
							<ScrollBar orientation="horizontal" />
						)}
						{orientation === "both" && <ScrollAreaPrimitive.Corner />}
					</ScrollAreaPrimitive.Root>
				)}
			</ScrollAreaContext.Provider>
		);
	},
);

ScrollArea.displayName = "ScrollArea";

const ScrollBar = forwardRef<
	ComponentRef<typeof ScrollAreaPrimitive.Scrollbar>,
	ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => {
	const isTouch = useContext(ScrollAreaContext);
	const shape = useShape();

	if (isTouch) return null;

	return (
		<ScrollAreaPrimitive.Scrollbar
			ref={ref}
			orientation={orientation}
			data-slot="scroll-area-scrollbar"
			className={cn(
				"group/scrollbar absolute z-20 flex touch-none select-none",
				"opacity-0 transition-opacity delay-160 duration-120 ease-out",
				"data-[hovering]:duration-160 data-[scrolling]:duration-160",
				"data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
				"data-[hovering]:delay-0 data-[scrolling]:delay-0",
				orientation === "vertical" && "top-0 right-0 h-full w-2.5",
				orientation === "horizontal" && "bottom-0 left-0 h-2.5 w-full flex-col",
				className,
			)}
			{...props}
		>
			<ScrollAreaPrimitive.Thumb
				data-slot="scroll-area-thumb"
				className={cn(
					"relative bg-[rgb(var(--overlay)/0.08)] transition-[background-color,width,height] duration-160 ease-in-out",
					"active:!bg-[rgb(var(--overlay)/0.16)] group-hover/scrollbar:bg-[rgb(var(--overlay)/0.12)]",
					shape.bg,
					orientation === "vertical" &&
						"mx-auto my-1 h-[var(--scroll-area-thumb-height)] w-1 -translate-x-0.5 group-hover/scrollbar:w-1.5",
					orientation === "horizontal" &&
						"mx-1 my-auto h-1 w-[var(--scroll-area-thumb-width)] -translate-y-0.5 group-hover/scrollbar:h-1.5",
				)}
			/>
		</ScrollAreaPrimitive.Scrollbar>
	);
});

ScrollBar.displayName = "ScrollBar";

export type { ScrollAreaProps };
export { ScrollArea, ScrollBar };
