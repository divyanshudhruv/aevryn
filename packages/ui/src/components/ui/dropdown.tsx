"use client";

import { FluidHoverHighlight } from "@aevryn/ui/components/fluid-hover-highlight";
import {
	DropdownEmpty,
	DropdownSearch,
	DropdownSearchHostContext,
	type DropdownSearchProps,
	useDropdownSearchHost,
} from "@aevryn/ui/components/ui/dropdown-search";
import {
	DropdownContext,
	type DropdownContextValue,
	type MenuItemRenderOptions,
	useDropdown,
	useDropdownMaybe,
} from "@aevryn/ui/components/ui/menu-item";
import { ScrollArea } from "@aevryn/ui/components/ui/scroll-area";
import { useFluidHover } from "@aevryn/ui/hooks/use-fluid-hover";
import {
	SelectionBackgrounds,
	useMergeSplitBlocks,
	useSelectionRuns,
} from "@aevryn/ui/hooks/use-merge-split";
import { Elevated } from "@aevryn/ui/lib/elevated";
import {
	isDisabledRow,
	popupMotionClass,
	popupScrollAreaClass,
	popupViewportClass,
} from "@aevryn/ui/lib/popup";
import { shapeMap } from "@aevryn/ui/lib/shape-context";
import {
	SizeProvider,
	type SizeVariant,
	useSize,
} from "@aevryn/ui/lib/size-context";
import { exitFallbackMs, spring } from "@aevryn/ui/lib/springs";
import { cn } from "@aevryn/ui/lib/utils";
import type { MenuTriggerProps } from "@base-ui/react/menu";
import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion } from "framer-motion";
import {
	type ComponentProps,
	createContext,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

const shape = shapeMap.rounded;

export type { DropdownContextValue, MenuItemRenderOptions };
export { useDropdown, useDropdownMaybe };

interface DropdownProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	checkedIndex?: number;
	checkedIndices?: number[];
	size?: SizeVariant;
}

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
	(
		{ children, checkedIndex, checkedIndices, size, className, ...props },
		ref,
	) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const hover = useFluidHover(containerRef, {
			isItemDisabled: isDisabledRow,
		});
		const { activeIndex, setActiveIndex, itemRects, handlers, registerItem } =
			hover;

		const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

		const multiple = checkedIndices != null;
		const checkedRect =
			!multiple && checkedIndex != null ? itemRects[checkedIndex] : null;
		const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null;
		const runs = useSelectionRuns(checkedIndices ?? []);
		const blocks = useMergeSplitBlocks(runs, itemRects, shape.bgRadius);
		const panelCtx = useMemo(
			() => ({
				registerItem,
				activeIndex,
				checkedIndex,
				multiple,
				checkedIndices,
			}),
			[registerItem, activeIndex, checkedIndex, multiple, checkedIndices],
		);
		const panel = (
			<DropdownContext.Provider value={panelCtx}>
				<Elevated
					offset={2}
					shadowLevel={3}
					ref={(node) => {
						(
							containerRef as React.MutableRefObject<HTMLDivElement | null>
						).current = node;
						if (typeof ref === "function") ref(node);
						else if (ref)
							(ref as React.MutableRefObject<HTMLDivElement | null>).current =
								node;
					}}
					onMouseEnter={handlers.onMouseEnter}
					onMouseMove={handlers.onMouseMove}
					onMouseLeave={handlers.onMouseLeave}
					onClick={handlers.onClick}
					onFocus={(e) => {
						const indexAttr = (e.target as HTMLElement)
							.closest("[data-fluid-hover-index]")
							?.getAttribute("data-fluid-hover-index");
						if (indexAttr != null) {
							const idx = Number(indexAttr);
							setActiveIndex(idx);
							setFocusedIndex(
								(e.target as HTMLElement).matches(":focus-visible")
									? idx
									: null,
							);
						}
					}}
					onBlur={(e) => {
						if (containerRef.current?.contains(e.relatedTarget as Node)) return;
						setFocusedIndex(null);
						setActiveIndex(null);
					}}
					onKeyDown={(e) => {
						const items = Array.from(
							containerRef.current?.querySelectorAll(
								'[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
							) ?? [],
						) as HTMLElement[];
						const currentIdx = items.indexOf(e.target as HTMLElement);
						if (currentIdx === -1) return;

						if (
							["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(
								e.key,
							)
						) {
							e.preventDefault();
							const next = ["ArrowDown", "ArrowRight"].includes(e.key)
								? (currentIdx + 1) % items.length
								: (currentIdx - 1 + items.length) % items.length;
							items[next]?.focus();
						} else if (e.key === "Home") {
							e.preventDefault();
							items[0]?.focus();
						} else if (e.key === "End") {
							e.preventDefault();
							items[items.length - 1]?.focus();
						}
					}}
					role="group"
					className={cn(
						"relative flex w-72 max-w-full select-none flex-col p-1",
						className,
					)}
					{...props}
				>
					{multiple && <SelectionBackgrounds blocks={blocks} />}

					<AnimatePresence>
						{checkedRect && (
							<motion.div
								className={`absolute ${shape.bg} pointer-events-none bg-active`}
								initial={false}
								animate={{
									top: checkedRect.top,
									left: checkedRect.left,
									width: checkedRect.width,
									height: checkedRect.height,
									opacity: 1,
								}}
								exit={{ opacity: 0, transition: spring.moderate.exit }}
								transition={{
									...spring.moderate,
									opacity: { duration: 0.08 },
								}}
							/>
						)}
					</AnimatePresence>

					<FluidHoverHighlight
						hover={hover}
						from={checkedRect}
						className={shape.bg}
					/>

					{/* Focus ring */}
					<AnimatePresence>
						{focusRect && (
							<motion.div
								className={`absolute ${shape.focusRing} pointer-events-none z-20 border border-[color:var(--focus-ring,#6B97FF)]`}
								initial={false}
								animate={{
									left: focusRect.left - 2,
									top: focusRect.top - 2,
									width: focusRect.width + 4,
									height: focusRect.height + 4,
								}}
								exit={{ opacity: 0, transition: spring.fast.exit }}
								transition={{
									...spring.fast,
									opacity: { duration: 0.08 },
								}}
							/>
						)}
					</AnimatePresence>

					{children}
				</Elevated>
			</DropdownContext.Provider>
		);

		return size ? <SizeProvider size={size}>{panel}</SizeProvider> : panel;
	},
);

Dropdown.displayName = "Dropdown";

interface DropdownMenuActions {
	unmount: () => void;
	close: () => void;
}

interface DropdownMenuContextValue {
	open: boolean;
	actionsRef: React.RefObject<DropdownMenuActions | null>;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(
	null,
);

function useDropdownMenuContext() {
	const ctx = useContext(DropdownMenuContext);
	if (!ctx)
		throw new Error(
			"DropdownMenu compound components must be inside <DropdownMenu>",
		);
	return ctx;
}

interface DropdownMenuProps {
	children: ReactNode;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
	size?: SizeVariant;
}

function DropdownMenu({
	children,
	open: openProp,
	defaultOpen = false,
	onOpenChange,
	disabled = false,
	size,
}: DropdownMenuProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const open = openProp !== undefined ? openProp : internalOpen;
	const actionsRef = useRef<DropdownMenuActions | null>(null);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (openProp === undefined) setInternalOpen(next);
			onOpenChange?.(next);
		},
		[openProp, onOpenChange],
	);

	const ctx = useMemo(() => ({ open, actionsRef }), [open]);

	const root = (
		<DropdownMenuContext.Provider value={ctx}>
			<Menu.Root
				open={open}
				onOpenChange={handleOpenChange}
				actionsRef={actionsRef}
				disabled={disabled}
				modal={false}
			>
				{children}
			</Menu.Root>
		</DropdownMenuContext.Provider>
	);

	return size ? <SizeProvider size={size}>{root}</SizeProvider> : root;
}

DropdownMenu.displayName = "DropdownMenu";

type DropdownTriggerProps = MenuTriggerProps;

const DropdownTrigger = Menu.Trigger;

type MenuPositionerProps = ComponentProps<typeof Menu.Positioner>;

interface DropdownContentProps {
	children: ReactNode;
	className?: string;
	checkedIndex?: number;
	checkedIndices?: number[];
	side?: MenuPositionerProps["side"];
	align?: MenuPositionerProps["align"];
	sideOffset?: number;
}

const DropdownContent = forwardRef<HTMLDivElement, DropdownContentProps>(
	(
		{
			className,
			children,
			checkedIndex,
			checkedIndices,
			side = "bottom",
			align = "start",
			sideOffset = 6,
		},
		ref,
	) => {
		const { open, actionsRef } = useDropdownMenuContext();
		const containerRef = useRef<HTMLDivElement>(null);

		const hover = useFluidHover(containerRef, {
			isItemDisabled: isDisabledRow,
		});
		const {
			activeIndex,
			setActiveIndex,
			itemRects,
			handlers,
			registerItem,
			remeasure,
		} = hover;

		const {
			host: searchHost,
			hasSearch,
			searchMounted,
			onKeyDownCapture: redirectTypingToSearch,
			isSearchField,
			highlightFirst,
		} = useDropdownSearchHost(open, { containerRef, setActiveIndex });

		useEffect(() => {
			if (!open) return;
			let inner: number | undefined;
			const outer = requestAnimationFrame(() => {
				inner = requestAnimationFrame(() => {
					if (hasSearch()) return;
					const container = containerRef.current;
					if (
						!container ||
						(container.contains(document.activeElement) &&
							document.activeElement !== container)
					)
						return;
					const first = container.querySelector<HTMLElement>(
						'[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])',
					);
					first?.focus();
				});
			});
			return () => {
				cancelAnimationFrame(outer);
				if (inner !== undefined) cancelAnimationFrame(inner);
			};
		}, [open, hasSearch]);

		useEffect(() => {
			if (open) return;
			const id = setTimeout(
				() => actionsRef.current?.unmount(),
				exitFallbackMs(spring.fast),
			);
			return () => clearTimeout(id);
		}, [open, actionsRef]);

		useEffect(() => {
			if (!open) return;
			remeasure();
		}, [open, remeasure]);

		const multiple = checkedIndices != null;
		const checkedRect =
			!multiple && checkedIndex != null ? itemRects[checkedIndex] : null;
		const runs = useSelectionRuns(checkedIndices ?? []);
		const blocks = useMergeSplitBlocks(
			runs,
			open ? itemRects : [],
			shape.bgRadius,
		);
		const renderMenuItem = useCallback(
			({
				radio,
				checkbox,
				checked,
				value,
				disabled,
				label,
				closeOnClick,
				element,
				children,
			}: MenuItemRenderOptions) =>
				checkbox ? (
					<Menu.CheckboxItem
						checked={!!checked}
						disabled={disabled}
						label={label}
						closeOnClick={closeOnClick}
						render={element}
					>
						{children}
					</Menu.CheckboxItem>
				) : radio ? (
					<Menu.RadioItem
						value={value}
						disabled={disabled}
						label={label}
						closeOnClick={closeOnClick}
						render={element}
					>
						{children}
					</Menu.RadioItem>
				) : (
					<Menu.Item
						disabled={disabled}
						label={label}
						closeOnClick={closeOnClick}
						render={element}
					>
						{children}
					</Menu.Item>
				),
			[],
		);

		const contentCtx = useMemo(
			() => ({
				registerItem,
				activeIndex,
				checkedIndex,
				multiple,
				checkedIndices,
				inMenu: true,
				renderMenuItem,
			}),
			[
				registerItem,
				activeIndex,
				checkedIndex,
				multiple,
				checkedIndices,
				renderMenuItem,
			],
		);

		return (
			<Menu.Portal>
				<Menu.Positioner
					side={side}
					align={align}
					sideOffset={sideOffset}
					className="z-50 outline-none"
				>
					<motion.div
						className={popupMotionClass}
						initial={{ opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }}
						animate={
							open
								? { opacity: 1, y: 0, scaleY: 1 }
								: { opacity: 0, y: "var(--popup-enter-y)", scaleY: 0.96 }
						}
						transition={open ? spring.fast : spring.fast.exit}
						onAnimationComplete={() => {
							if (!open) actionsRef.current?.unmount();
						}}
					>
						<DropdownContext.Provider value={contentCtx}>
							<DropdownSearchHostContext.Provider value={searchHost}>
								<Menu.Popup
									render={<Elevated offset={2} shadowLevel={3} ref={ref} />}
									onKeyDownCapture={redirectTypingToSearch}
									onMouseEnter={handlers.onMouseEnter}
									onMouseMove={handlers.onMouseMove}
									onClick={handlers.onClick}
									onMouseLeave={() => {
										handlers.onMouseLeave();
										if (isSearchField(document.activeElement)) highlightFirst();
									}}
									onFocus={(e) => {
										const indexAttr = (e.target as HTMLElement)
											.closest("[data-fluid-hover-index]")
											?.getAttribute("data-fluid-hover-index");
										if (indexAttr != null) {
											setActiveIndex(Number(indexAttr));
										} else if (isSearchField(e.target)) {
											highlightFirst();
										} else if (e.target !== e.currentTarget) {
											setActiveIndex(null);
										}
									}}
									onBlur={(e) => {
										if (e.currentTarget.contains(e.relatedTarget as Node))
											return;
										setActiveIndex(null);
									}}
									className={cn(
										`flex max-h-[min(480px,var(--available-height))] w-72 min-w-[var(--anchor-width)] max-w-full flex-col overflow-hidden ${shape.container} select-none outline-none`,
										className,
									)}
								>
									<ScrollArea
										className={popupScrollAreaClass}
										viewportClassName={cn(
											popupViewportClass,
											!searchMounted && "scroll-fade",
										)}
									>
										<div
											ref={containerRef}
											className="relative flex flex-col p-1"
										>
											{multiple && <SelectionBackgrounds blocks={blocks} />}

											<AnimatePresence>
												{checkedRect && (
													<motion.div
														className={`absolute ${shape.bg} pointer-events-none bg-active`}
														initial={false}
														animate={{
															top: checkedRect.top,
															left: checkedRect.left,
															width: checkedRect.width,
															height: checkedRect.height,
															opacity: 1,
														}}
														exit={{
															opacity: 0,
															transition: spring.moderate.exit,
														}}
														transition={{
															...spring.moderate,
															opacity: { duration: 0.08 },
														}}
													/>
												)}
											</AnimatePresence>

											<FluidHoverHighlight
												hover={hover}
												from={checkedRect}
												className={shape.bg}
											/>

											{/* display: contents keeps items direct flex children of the
                    wrapper so fluid hover measurement and gap layout still work,
                    while the group provides the radio value context. */}
											<Menu.RadioGroup
												value={checkedIndex ?? null}
												className="contents"
											>
												{children}
											</Menu.RadioGroup>
										</div>
									</ScrollArea>
								</Menu.Popup>
							</DropdownSearchHostContext.Provider>
						</DropdownContext.Provider>
					</motion.div>
				</Menu.Positioner>
			</Menu.Portal>
		);
	},
);

DropdownContent.displayName = "DropdownContent";

const DropdownLabel = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
	const compact = useSize().variant === "compact";
	return (
		<div
			ref={ref}
			className={cn(
				"shrink-0 px-2 py-1.5 text-muted-foreground",
				compact ? "text-[11px]" : "text-[12px]",
				className,
			)}
			{...props}
		/>
	);
});

DropdownLabel.displayName = "DropdownLabel";

const DropdownSeparator = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		role="separator"
		className={cn("-mx-1 my-1 h-px shrink-0 bg-border/60", className)}
		{...props}
	/>
));

DropdownSeparator.displayName = "DropdownSeparator";

export type {
	DropdownContentProps,
	DropdownMenuProps,
	DropdownProps,
	DropdownSearchProps,
	DropdownTriggerProps,
};
export {
	Dropdown,
	DropdownContent,
	DropdownEmpty,
	DropdownLabel,
	DropdownMenu,
	DropdownSearch,
	DropdownSeparator,
	DropdownTrigger,
};
export default Dropdown;
