"use client";

import { FluidHoverHighlight } from "@aevryn/ui/components/fluid-hover-highlight";
import { ScrollArea } from "@aevryn/ui/components/ui/scroll-area";
import {
	useFluidHover,
	useRegisterFluidHoverItem,
} from "@aevryn/ui/hooks/use-fluid-hover";
import { useKeyboardNavGate } from "@aevryn/ui/hooks/use-keyboard-nav-gate";
import { Elevated } from "@aevryn/ui/lib/elevated";
import type { IconComponent } from "@aevryn/ui/lib/icon-context";
import {
	isDisabledRow,
	popupMotionClass,
	popupScrollAreaClass,
	popupViewportClass,
} from "@aevryn/ui/lib/popup";
import { shapeMap, useShape } from "@aevryn/ui/lib/shape-context";
import {
	SizeProvider,
	type SizeVariant,
	useSize,
} from "@aevryn/ui/lib/size-context";
import { exitFallbackMs, spring } from "@aevryn/ui/lib/springs";
import { cn } from "@aevryn/ui/lib/utils";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import {
	Children,
	createContext,
	forwardRef,
	type HTMLAttributes,
	isValidElement,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

const selectionAckMs = 300;

interface SelectContextValue {
	value: string;
	open: boolean;
	actionsRef: React.RefObject<{ unmount: () => void } | null>;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext() {
	const ctx = useContext(SelectContext);
	if (!ctx)
		throw new Error("Select compound components must be inside <Select>");
	return ctx;
}

interface SelectContentContextValue {
	registerItem: (index: number, element: HTMLElement | null) => void;
	activeIndex: number | null;
	checkedIndex?: number;
}

const SelectContentContext = createContext<SelectContentContextValue | null>(
	null,
);

const popupShape = shapeMap.rounded;

interface SelectProps {
	children: ReactNode;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	name?: string;
	required?: boolean;
	size?: SizeVariant;
}

function collectSelectItems(
	node: ReactNode,
	out: { value: string; label: ReactNode }[] = [],
) {
	Children.forEach(node, (child) => {
		if (!isValidElement(child)) return;
		const props = child.props as { value?: unknown; children?: ReactNode };
		if (typeof props.value === "string") {
			out.push({
				value: props.value,
				label:
					typeof props.children === "string" ? props.children : props.value,
			});
		} else if (props.children) {
			collectSelectItems(props.children, out);
		}
	});
	return out;
}

function Select({
	children,
	value,
	defaultValue,
	onValueChange,
	disabled = false,
	name,
	required,
	size,
}: SelectProps) {
	const [internalValue, setInternalValue] = useState(defaultValue ?? "");
	const [open, setOpen] = useState(false);
	const actionsRef = useRef<{ unmount: () => void } | null>(null);
	const currentValue = value !== undefined ? value : internalValue;

	const items = useMemo(() => collectSelectItems(children), [children]);

	const handleValueChange = useCallback(
		(next: string | null) => {
			const v = next ?? "";
			if (value === undefined) setInternalValue(v);
			onValueChange?.(v);
		},
		[value, onValueChange],
	);

	const ackTimeoutRef = useRef<number | null>(null);
	const cancelAckClose = useCallback(() => {
		if (ackTimeoutRef.current !== null) {
			clearTimeout(ackTimeoutRef.current);
			ackTimeoutRef.current = null;
		}
	}, []);
	useEffect(() => cancelAckClose, [cancelAckClose]);

	const handleOpenChange = useCallback(
		(nextOpen: boolean, eventDetails: { reason: string }) => {
			if (!nextOpen && eventDetails.reason === "item-press") {
				cancelAckClose();
				ackTimeoutRef.current = window.setTimeout(() => {
					ackTimeoutRef.current = null;
					setOpen(false);
				}, selectionAckMs);
				return;
			}
			cancelAckClose();
			setOpen(nextOpen);
		},
		[cancelAckClose],
	);

	const ctx = useMemo(
		() => ({ value: currentValue, open, actionsRef }),
		[currentValue, open],
	);

	const root = (
		<SelectContext.Provider value={ctx}>
			<SelectPrimitive.Root
				value={currentValue === "" ? null : currentValue}
				onValueChange={handleValueChange}
				open={open}
				onOpenChange={handleOpenChange}
				actionsRef={actionsRef}
				items={items}
				disabled={disabled}
				name={name}
				required={required}
				modal={false}
			>
				{children}
			</SelectPrimitive.Root>
		</SelectContext.Provider>
	);

	return size ? <SizeProvider size={size}>{root}</SizeProvider> : root;
}

Select.displayName = "Select";

const triggerVariants = cva(
	[
		"group inline-flex cursor-pointer items-center justify-between outline-none",
		"transition-all duration-80",
		"disabled:pointer-events-none disabled:opacity-50",
		"focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]",
	],
	{
		variants: {
			variant: {
				bordered:
					"border border-border bg-transparent text-foreground hover:bg-hover",
				borderless:
					"border border-transparent bg-transparent text-foreground hover:bg-hover",
			},
		},
		defaultVariants: {
			variant: "bordered",
		},
	},
);

interface SelectTriggerProps
	extends Omit<HTMLAttributes<HTMLButtonElement>, "children">,
		VariantProps<typeof triggerVariants> {
	icon?: IconComponent;
	placeholder?: string;
	error?: string;
	size?: SizeVariant;
}

const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
	(
		{
			className,
			variant,
			icon: Icon,
			placeholder = "Select…",
			error,
			size,
			...props
		},
		ref,
	) => {
		const shape = useShape();
		const sizeClasses = useSize(size);
		const compact = sizeClasses.variant === "compact";

		return (
			<div className="flex flex-col gap-1">
				<SelectPrimitive.Trigger
					ref={ref}
					aria-invalid={!!error || undefined}
					className={cn(
						triggerVariants({ variant }),
						sizeClasses.control,
						sizeClasses.text,
						sizeClasses.px,
						sizeClasses.gap,
						compact ? "min-w-[128px]" : "min-w-[160px]",
						shape.input,
						error && "border-destructive/50 hover:border-destructive/50",
						className,
					)}
					{...props}
				>
					<span
						className={cn("flex min-w-0 flex-1 items-center", sizeClasses.gap)}
					>
						{Icon && (
							<Icon
								size={sizeClasses.icon}
								strokeWidth={1.5}
								className="shrink-0 text-muted-foreground transition-[color,stroke-width] duration-80 group-hover:stroke-[2] group-hover:text-foreground"
							/>
						)}
						<SelectPrimitive.Value
							placeholder={placeholder}
							className="-my-1 min-w-0 flex-1 truncate py-1 text-left [text-box:trim-both_cap_alphabetic] data-[placeholder]:text-muted-foreground"
						/>
					</span>

					<svg
						width={sizeClasses.icon}
						height={sizeClasses.icon}
						aria-hidden
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						className="shrink-0 text-muted-foreground transition-colors duration-80 group-hover:text-foreground"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</SelectPrimitive.Trigger>
				{error && (
					<span className="pl-3 text-[12px] text-destructive">{error}</span>
				)}
			</div>
		);
	},
);

SelectTrigger.displayName = "SelectTrigger";

interface SelectContentProps {
	className?: string;
	children: ReactNode;
}

const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(
	({ className, children }, ref) => {
		const { open, value, actionsRef } = useSelectContext();
		const shape = popupShape;
		const containerRef = useRef<HTMLDivElement>(null);

		const hover = useFluidHover(containerRef, {
			isItemDisabled: isDisabledRow,
		});
		const {
			activeIndex,
			setActiveIndex,
			itemRects,
			isMeasured,
			handlers,
			registerItem,
			remeasure,
		} = hover;

		const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

		const { keyboardNavRef, trackKeyboardNav } = useKeyboardNavGate(open);
		const [checkedIndex, setCheckedIndex] = useState<number | undefined>(
			undefined,
		);

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

		useEffect(() => {
			if (!open) return;
			let inner: number;
			const outer = requestAnimationFrame(() => {
				inner = requestAnimationFrame(() => {
					const container = containerRef.current;
					if (container) {
						const items = Array.from(
							container.querySelectorAll("[data-fluid-hover-index]"),
						) as HTMLElement[];
						const idx = items.findIndex(
							(el) => el.getAttribute("data-value") === value,
						);
						setCheckedIndex(idx !== -1 ? idx : undefined);
					}
				});
			});
			return () => {
				cancelAnimationFrame(outer);
				cancelAnimationFrame(inner);
			};
		}, [open, value]);

		useEffect(() => {
			if (open) return;
			setCheckedIndex(undefined);
			setActiveIndex(null);
			setFocusedIndex(null);
		}, [open, setActiveIndex]);

		const checkedRect =
			isMeasured && checkedIndex != null ? itemRects[checkedIndex] : null;
		const focusRect =
			isMeasured && focusedIndex !== null ? itemRects[focusedIndex] : null;

		const contentCtx = useMemo(
			() => ({ registerItem, activeIndex, checkedIndex }),
			[registerItem, activeIndex, checkedIndex],
		);

		return (
			<SelectPrimitive.Portal>
				<SelectPrimitive.Positioner
					side="bottom"
					align="start"
					sideOffset={6}
					alignItemWithTrigger={false}
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
						<SelectContentContext.Provider value={contentCtx}>
							<SelectPrimitive.Popup
								render={<Elevated offset={2} shadowLevel={3} ref={ref} />}
								onKeyDownCapture={trackKeyboardNav}
								onMouseEnter={() => {
									handlers.onMouseEnter();
									setFocusedIndex(null);
								}}
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
											keyboardNavRef.current &&
												(e.target as HTMLElement).matches(":focus-visible")
												? idx
												: null,
										);
									}
								}}
								onBlur={(e) => {
									if (e.currentTarget.contains(e.relatedTarget as Node)) return;
									setFocusedIndex(null);
									setActiveIndex(null);
								}}
								className={cn(
									`flex max-h-[min(300px,var(--available-height))] min-w-[var(--anchor-width)] flex-col overflow-hidden ${shape.container} select-none outline-none`,
									className,
								)}
							>
								<ScrollArea
									className={popupScrollAreaClass}
									viewportClassName={cn(popupViewportClass, "scroll-fade")}
								>
									<div
										ref={containerRef}
										className="relative flex flex-col p-1"
									>
										{open && (
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
										)}

										<FluidHoverHighlight
											hover={hover}
											hidden={!open}
											className={shape.bg}
										/>

										{/* Focus ring */}
										{open && (
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
										)}

										{children}
									</div>
								</ScrollArea>
							</SelectPrimitive.Popup>
						</SelectContentContext.Provider>
					</motion.div>
				</SelectPrimitive.Positioner>
			</SelectPrimitive.Portal>
		);
	},
);

SelectContent.displayName = "SelectContent";

interface SelectItemProps extends HTMLAttributes<HTMLDivElement> {
	icon?: IconComponent;
	index: number;
	value: string;
	disabled?: boolean;
}

const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
	(
		{
			className,
			children,
			icon: Icon,
			value,
			index,
			disabled = false,
			...props
		},
		ref,
	) => {
		const selectCtx = useSelectContext();
		const contentCtx = useContext(SelectContentContext);
		const internalRef = useRef<HTMLDivElement>(null);
		const shape = popupShape;
		const sizeClasses = useSize();
		const compact = sizeClasses.variant === "compact";
		const hasMounted = useRef(false);

		useEffect(() => {
			hasMounted.current = true;
		}, []);

		const registerItem = contentCtx?.registerItem;
		useRegisterFluidHoverItem(registerItem, index, internalRef);

		const isActive = contentCtx?.activeIndex === index;
		const isChecked = selectCtx.value === value;
		const skipAnimation = !hasMounted.current;

		return (
			<SelectPrimitive.Item
				value={value}
				disabled={disabled}
				label={typeof children === "string" ? children : undefined}
				render={
					<div
						ref={(node: HTMLDivElement | null) => {
							(
								internalRef as React.MutableRefObject<HTMLDivElement | null>
							).current = node;
							if (typeof ref === "function") ref(node);
							else if (ref)
								(ref as React.MutableRefObject<HTMLDivElement | null>).current =
									node;
						}}
						data-fluid-hover-index={index}
						data-value={value}
						className={cn(
							`relative z-10 flex ${sizeClasses.control} shrink-0 items-center ${sizeClasses.gap} ${shape.item} ${sizeClasses.itemPx} ${sizeClasses.text} cursor-pointer select-none outline-none`,
							"transition-[color] duration-80",
							isActive || isChecked
								? "text-foreground"
								: "text-muted-foreground",
							disabled && "pointer-events-none opacity-50",
							className,
						)}
						{...props}
					/>
				}
			>
				{Icon && (
					<Icon
						size={sizeClasses.icon}
						strokeWidth={isActive || isChecked ? 2 : 1.5}
						className="shrink-0 transition-[color,stroke-width] duration-80"
					/>
				)}

				<SelectPrimitive.ItemText
					render={
						<span className="-my-1 min-w-0 flex-1 truncate py-1 [text-box:trim-both_cap_alphabetic]" />
					}
				>
					{children}
				</SelectPrimitive.ItemText>

				<span
					aria-hidden
					className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")}
				>
					<AnimatePresence>
						{isChecked && (
							<motion.svg
								key="check"
								width={sizeClasses.icon}
								height={sizeClasses.icon}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth={2}
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-foreground"
								initial={{ opacity: 1 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 1 }}
							>
								<motion.path
									d="M4 12L9 17L20 6"
									initial={{ pathLength: skipAnimation ? 1 : 0 }}
									animate={{
										pathLength: 1,
										transition: { duration: 0.08, ease: "easeOut" },
									}}
									exit={{
										pathLength: 0,
										transition: { duration: 0.04, ease: "easeIn" },
									}}
								/>
							</motion.svg>
						)}
					</AnimatePresence>
				</span>
			</SelectPrimitive.Item>
		);
	},
);

SelectItem.displayName = "SelectItem";

function SelectGroup({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div role="group" className={className} {...props}>
			{children}
		</div>
	);
}

SelectGroup.displayName = "SelectGroup";

const SelectLabel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => {
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
	},
);

SelectLabel.displayName = "SelectLabel";

const SelectSeparator = forwardRef<
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

SelectSeparator.displayName = "SelectSeparator";

export type {
	SelectContentProps,
	SelectItemProps,
	SelectProps,
	SelectTriggerProps,
};
export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	triggerVariants,
};
