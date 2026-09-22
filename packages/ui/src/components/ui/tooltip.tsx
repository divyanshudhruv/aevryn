"use client";

import { fontWeights } from "@aevryn/ui/lib/font-weight";
import { useShape } from "@aevryn/ui/lib/shape-context";
import { spring } from "@aevryn/ui/lib/springs";
import { cn } from "@aevryn/ui/lib/utils";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { motion, useMotionValue } from "framer-motion";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

const TooltipPortalContainerContext = createContext<HTMLElement | null>(null);

function TooltipPortalContainer({
	value,
	children,
}: {
	value: HTMLElement | null;
	children: ReactNode;
}) {
	return (
		<TooltipPortalContainerContext.Provider value={value}>
			{children}
		</TooltipPortalContainerContext.Provider>
	);
}

const DEFAULT_DELAY = 200;

const TooltipGroupContext = createContext(false);

interface TooltipProviderProps {
	children: ReactNode;
	delayDuration?: number;
	skipDelayDuration?: number;
}

function TooltipProvider({
	children,
	delayDuration = DEFAULT_DELAY,
	skipDelayDuration = 300,
}: TooltipProviderProps) {
	return (
		<TooltipGroupContext.Provider value={true}>
			<TooltipPrimitive.Provider
				delay={delayDuration}
				timeout={skipDelayDuration}
			>
				{children}
			</TooltipPrimitive.Provider>
		</TooltipGroupContext.Provider>
	);
}

type TooltipSide = "top" | "right" | "bottom" | "left";

interface TooltipProps {
	content: ReactNode;
	children: React.ReactElement;
	side?: TooltipSide;
	sideOffset?: number;
	delayDuration?: number;
	className?: string;
	contentClassName?: string;
	forceOpen?: boolean;
	followCursor?: "x" | "y";
	onOpenChange?: (open: boolean) => void;
}

function getSlideOffset(side: TooltipSide) {
	switch (side) {
		case "top":
			return { y: 4 };
		case "bottom":
			return { y: -4 };
		case "left":
			return { x: 4 };
		case "right":
			return { x: -4 };
	}
}

function Tooltip({
	content,
	children,
	side = "top",
	sideOffset = 8,
	delayDuration,
	className,
	contentClassName,
	forceOpen,
	onOpenChange: onOpenChangeProp,
	followCursor,
}: TooltipProps) {
	const [internalOpen, setInternalOpen] = useState(false);
	const open = forceOpen !== undefined ? forceOpen : internalOpen;
	const shape = useShape();
	const portalContainer = useContext(TooltipPortalContainerContext);
	const hasAmbientProvider = useContext(TooltipGroupContext);

	const slideOffset = getSlideOffset(side);

	const followOffset = useMotionValue(0);
	useEffect(() => {
		if (forceOpen && followCursor) followOffset.set(0);
	}, [forceOpen, followCursor, followOffset]);
	const handleFollowMove = (event: React.PointerEvent) => {
		if (!followCursor) return;
		const rect = event.currentTarget.getBoundingClientRect();
		followOffset.set(
			followCursor === "y"
				? event.clientY - (rect.top + rect.height / 2)
				: event.clientX - (rect.left + rect.width / 2),
		);
	};

	const tooltip = (
		<TooltipPrimitive.Root
			open={open}
			onOpenChange={(v) => {
				setInternalOpen(v);
				onOpenChangeProp?.(v);
			}}
		>
			<TooltipPrimitive.Trigger
				render={children}
				delay={delayDuration}
				onPointerMove={followCursor ? handleFollowMove : undefined}
			/>
			<TooltipPrimitive.Portal container={portalContainer ?? undefined}>
				<TooltipPrimitive.Positioner
					side={side}
					sideOffset={sideOffset}
					className={cn("z-50", contentClassName)}
				>
					<TooltipPrimitive.Popup
						render={(props, state) => {
							const exiting = state.transitionStatus === "ending";
							const contentChildren = content;
							const {
								style: baseStyle,
								onDrag: _onDrag,
								onDragStart: _onDragStart,
								onDragEnd: _onDragEnd,
								onAnimationStart: _onAnimationStart,
								onAnimationEnd: _onAnimationEnd,
								onAnimationIteration: _onAnimationIteration,
								...rest
							} = props as React.HTMLAttributes<HTMLDivElement>;
							return (
								<motion.div
									{...rest}
									style={{
										...(baseStyle as React.CSSProperties | undefined),
										...(followCursor === "y"
											? { y: followOffset }
											: followCursor === "x"
												? { x: followOffset }
												: {}),
									}}
								>
									<motion.div
										className={cn(
											"bg-foreground px-2 py-1 text-[12px] text-background",
											"[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both]:py-2",
											shape.bg,
											className,
										)}
										style={{ fontVariationSettings: fontWeights.medium }}
										initial={{ opacity: 0, ...slideOffset }}
										animate={
											exiting
												? { opacity: 0, ...slideOffset }
												: { opacity: 1, x: 0, y: 0 }
										}
										transition={exiting ? spring.fast.exit : spring.fast}
									>
										{contentChildren}
									</motion.div>
								</motion.div>
							);
						}}
					/>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);

	if (hasAmbientProvider) return tooltip;

	return (
		<TooltipPrimitive.Provider delay={delayDuration ?? DEFAULT_DELAY}>
			{tooltip}
		</TooltipPrimitive.Provider>
	);
}

export type { TooltipProps, TooltipProviderProps, TooltipSide };
export { Tooltip, TooltipPortalContainer, TooltipProvider };
