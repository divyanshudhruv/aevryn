"use client";

import { ScrollArea } from "@aevryn/ui/components/ui/scroll-area";
import {
	type SidebarCollapsible,
	SidebarShell,
	type SidebarSide,
	type SidebarVariant,
	useSidebar,
} from "@aevryn/ui/components/ui/sidebar-core";
import { exitFallbackMs, spring } from "@aevryn/ui/lib/springs";
import { surfaceClasses } from "@aevryn/ui/lib/surface-classes";
import { SurfaceProvider, useSurface } from "@aevryn/ui/lib/surface-context";
import { cn } from "@aevryn/ui/lib/utils";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import {
	type CSSProperties,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

type MotionSafeDivProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	| "onDrag"
	| "onDragStart"
	| "onDragEnd"
	| "onAnimationStart"
	| "onAnimationEnd"
	| "onAnimationIteration"
>;

interface SidebarSheetProps {
	side: SidebarSide;
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}

function SidebarSheet({ side, open, onClose, children }: SidebarSheetProps) {
	const { widthMobile } = useSidebar();
	const reduceMotion = useReducedMotion() ?? false;
	const panelRef = useRef<HTMLDivElement | null>(null);
	const substrate = useSurface();
	const level = Math.min(substrate + 2, 8);

	const [closing, setClosing] = useState(false);
	const visible = open && !closing;

	const finishClose = useCallback(() => {
		setClosing(false);
		onClose();
	}, [onClose]);

	const wasOpen = useRef(open);
	useEffect(() => {
		if (wasOpen.current && !open) setClosing(true);
		wasOpen.current = open;
	}, [open]);

	useEffect(() => {
		if (!closing) return;
		const id = setTimeout(finishClose, exitFallbackMs(spring.moderate));
		return () => clearTimeout(id);
	}, [closing, finishClose]);

	const offscreen = side === "left" ? "-100%" : "100%";

	return (
		<DialogPrimitive.Root
			open={open || closing}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setClosing(true);
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop
					render={(backdropProps) => {
						const { style: _style, ...rest } =
							backdropProps as React.HTMLAttributes<HTMLDivElement>;
						return (
							<motion.div
								{...(rest as MotionSafeDivProps)}
								className="fixed inset-0 z-40 bg-black/40 dark:bg-black/80"
								initial={{ opacity: 0 }}
								animate={{ opacity: visible ? 1 : 0 }}
								transition={
									visible
										? { duration: spring.moderate.duration }
										: spring.moderate.exit
								}
							/>
						);
					}}
				/>

				<DialogPrimitive.Popup
					aria-label="Sidebar"
					initialFocus={panelRef}
					render={(popupProps) => {
						const {
							style: baseStyle,
							ref: baseRef,
							...rest
						} = popupProps as React.HTMLAttributes<HTMLDivElement> & {
							ref?: React.Ref<HTMLDivElement>;
						};
						return (
							<motion.div
								{...(rest as MotionSafeDivProps)}
								ref={(node: HTMLDivElement | null) => {
									panelRef.current = node;
									if (typeof baseRef === "function") baseRef(node);
									else if (baseRef)
										(
											baseRef as React.MutableRefObject<HTMLDivElement | null>
										).current = node;
								}}
								tabIndex={-1}
								data-sidebar="sidebar"
								data-mobile="true"
								data-side={side}
								className={cn(
									"fixed inset-y-0 z-50 flex flex-col overflow-hidden outline-none",
									!visible && "pointer-events-none",
									side === "left" ? "left-0" : "right-0",
									surfaceClasses(level, 3),
								)}
								style={{
									...(baseStyle as CSSProperties | undefined),
									width: widthMobile,
								}}
								initial={{ x: offscreen }}
								animate={{ x: visible ? 0 : offscreen }}
								transition={
									reduceMotion
										? { duration: 0 }
										: visible
											? spring.moderate
											: spring.moderate.exit
								}
								onAnimationComplete={() => {
									if (closing) finishClose();
								}}
							>
								<SurfaceProvider value={level}>{children}</SurfaceProvider>
							</motion.div>
						);
					}}
				/>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

export interface SidebarProps
	extends Omit<
		HTMLAttributes<HTMLDivElement>,
		| "onDrag"
		| "onDragStart"
		| "onDragEnd"
		| "onAnimationStart"
		| "onAnimationEnd"
		| "onAnimationIteration"
	> {
	side?: SidebarSide;
	variant?: SidebarVariant;
	collapsible?: SidebarCollapsible;
	bordered?: boolean;
	railTooltipOpen?: boolean;
	rail?: boolean;
}

const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(
	(
		{
			side = "left",
			variant = "sidebar",
			collapsible = "offcanvas",
			bordered = true,
			rail = true,
			railTooltipOpen,
			className,
			style,
			children,
			...props
		},
		ref,
	) => {
		const { isMobile, openMobile, setOpenMobile, width, registerSide } =
			useSidebar();

		useEffect(() => registerSide(side), [side, registerSide]);

		if (collapsible === "none") {
			return (
				<div
					ref={ref}
					data-slot="sidebar"
					data-variant={variant}
					data-side={side}
					className={cn(
						"peer sticky top-0 flex h-svh shrink-0 flex-col",
						side === "right" && "order-last",
						className,
					)}
					style={{ width, ...style } as CSSProperties}
					{...props}
				>
					<div
						data-sidebar="sidebar"
						className={cn(
							"flex h-full min-h-0 w-full flex-col",
							bordered &&
								variant === "sidebar" &&
								(side === "left"
									? "border-border border-r"
									: "border-border border-l"),
						)}
					>
						{children}
					</div>
				</div>
			);
		}

		return (
			<>
				{isMobile && (
					<SidebarSheet
						side={side}
						open={openMobile}
						onClose={() => setOpenMobile(false)}
					>
						{children}
					</SidebarSheet>
				)}
				<SidebarShell
					ref={ref}
					side={side}
					variant={variant}
					bordered={bordered}
					rail={rail}
					railTooltipOpen={railTooltipOpen}
					className={className}
					style={style}
					{...props}
				>
					{children}
				</SidebarShell>
			</>
		);
	},
);
Sidebar.displayName = "Sidebar";

export interface SidebarContentProps extends HTMLAttributes<HTMLDivElement> {
	viewportClassName?: string;
}

const SidebarContent = forwardRef<HTMLDivElement, SidebarContentProps>(
	({ className, viewportClassName, children, ...props }, ref) => {
		const { isMobile } = useSidebar();

		if (isMobile) {
			return (
				<div className="scroll-divider flex min-h-0 w-full flex-1 flex-col [--scroll-divider-inset:8px]">
					<div
						ref={ref}
						data-sidebar="content"
						className={cn(
							"scroll-fade flex min-h-0 w-full flex-1 flex-col overflow-y-auto",
							className,
						)}
						{...props}
					>
						{children}
					</div>
				</div>
			);
		}

		return (
			<ScrollArea
				className={cn("scroll-divider min-h-0 w-full flex-1", className)}
				viewportClassName={cn(
					"scroll-fade [&>div]:!block [&>div]:!min-w-0",
					viewportClassName,
				)}
			>
				<div
					ref={ref}
					data-sidebar="content"
					className="flex w-full min-w-0 flex-col"
					{...props}
				>
					{children}
				</div>
			</ScrollArea>
		);
	},
);
SidebarContent.displayName = "SidebarContent";

export type {
	SidebarCollapsible,
	SidebarContextValue,
	SidebarGroupActionProps,
	SidebarGroupLabelProps,
	SidebarInputProps,
	SidebarInsetProps,
	SidebarProviderProps,
	SidebarRailProps,
	SidebarSectionProps,
	SidebarSide,
	SidebarTriggerProps,
	SidebarVariant,
} from "@aevryn/ui/components/ui/sidebar-core";

export {
	SIDEBAR_COOKIE_MAX_AGE,
	SIDEBAR_COOKIE_NAME,
	SIDEBAR_KEYBOARD_SHORTCUT,
	SIDEBAR_KEYBOARD_SHORTCUT_RIGHT,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_WIDTH,
	SIDEBAR_WIDTH_MOBILE,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupActions,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from "@aevryn/ui/components/ui/sidebar-core";
export type {
	SidebarMenuActionProps,
	SidebarMenuBadgeProps,
	SidebarMenuButtonProps,
	SidebarMenuItemProps,
	SidebarMenuProps,
	SidebarMenuSkeletonProps,
	SidebarMenuSubButtonProps,
	SidebarMenuSubItemProps,
	SidebarMenuSubProps,
} from "@aevryn/ui/components/ui/sidebar-menu";
export {
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuActions,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	sidebarMenuButtonVariants,
} from "@aevryn/ui/components/ui/sidebar-menu";
export { Sidebar, SidebarContent };
