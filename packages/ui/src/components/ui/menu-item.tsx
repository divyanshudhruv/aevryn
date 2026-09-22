"use client";

import { useRegisterFluidHoverItem } from "@aevryn/ui/hooks/use-fluid-hover";
import { fontWeights } from "@aevryn/ui/lib/font-weight";
import type { IconComponent } from "@aevryn/ui/lib/icon-context";
import { shapeMap } from "@aevryn/ui/lib/shape-context";
import { useSize } from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	createContext,
	forwardRef,
	type HTMLAttributes,
	type ReactElement,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
} from "react";

const shape = shapeMap.rounded;

export interface MenuItemRenderOptions {
	radio: boolean;
	checkbox: boolean;
	checked?: boolean;
	value: number;
	disabled?: boolean;
	label: string;
	closeOnClick: boolean;
	element: ReactElement;
	children: ReactNode;
}

export interface DropdownContextValue {
	registerItem: (index: number, element: HTMLElement | null) => void;
	activeIndex: number | null;
	checkedIndex?: number;
	multiple?: boolean;
	checkedIndices?: number[];
	inMenu?: boolean;
	renderMenuItem?: (opts: MenuItemRenderOptions) => ReactElement;
}

export const DropdownContext = createContext<DropdownContextValue | null>(null);

export function useDropdown() {
	const ctx = useContext(DropdownContext);
	if (!ctx) throw new Error("useDropdown must be used within a Dropdown");
	return ctx;
}

export function useDropdownMaybe() {
	return useContext(DropdownContext);
}

interface MenuItemProps extends HTMLAttributes<HTMLDivElement> {
	icon?: IconComponent;
	label: string;
	index: number;
	trailing?: ReactNode;
	checked?: boolean;
	onSelect?: () => void;
	disabled?: boolean;
	closeOnClick?: boolean;
	truncate?: boolean;
}

const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
	(
		{
			icon: Icon,
			label,
			index,
			trailing,
			checked,
			onSelect,
			disabled,
			closeOnClick,
			truncate = false,
			className,
			onClick,
			...props
		},
		ref,
	) => {
		const internalRef = useRef<HTMLDivElement>(null);
		const hasMounted = useRef(false);
		const {
			registerItem,
			activeIndex,
			checkedIndex,
			multiple,
			checkedIndices,
			renderMenuItem,
		} = useDropdown();
		const isCheckbox = !!multiple && typeof checked === "boolean";

		useRegisterFluidHoverItem(registerItem, index, internalRef);

		useEffect(() => {
			hasMounted.current = true;
		}, []);

		const isActive = activeIndex === index;
		const skipAnimation = !hasMounted.current;
		const sizeClasses = useSize();

		const mergeRef = (node: HTMLDivElement | null) => {
			(internalRef as React.MutableRefObject<HTMLDivElement | null>).current =
				node;
			if (typeof ref === "function") ref(node);
			else if (ref)
				(ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
		};

		const handleActivate = disabled
			? undefined
			: (e: React.MouseEvent<HTMLDivElement>) => {
					onClick?.(e);
					onSelect?.();
				};

		const itemClassName = cn(
			`relative z-10 flex ${sizeClasses.control} shrink-0 items-center ${sizeClasses.gap} ${shape.item} ${sizeClasses.itemPx} cursor-pointer outline-none`,
			disabled && "pointer-events-none opacity-50",
			className,
		);

		const content = (
			<>
				{Icon && (
					<span className="inline-grid">
						<span className="invisible col-start-1 row-start-1">
							<Icon size={sizeClasses.icon} strokeWidth={2} />
						</span>
						<Icon
							size={sizeClasses.icon}
							strokeWidth={isActive || checked ? 2 : 1.5}
							className={cn(
								"col-start-1 row-start-1 transition-[color,stroke-width] duration-80",
								isActive || checked
									? "text-foreground"
									: "text-muted-foreground",
							)}
						/>
					</span>
				)}
				<span
					className={cn(
						"inline-grid min-w-0 flex-1",
						truncate && "block",
						sizeClasses.text,
					)}
				>
					{!truncate && (
						<span
							className="invisible col-start-1 row-start-1 [text-box:trim-both_cap_alphabetic]"
							style={{ fontVariationSettings: fontWeights.semibold }}
							aria-hidden="true"
						>
							{label}
						</span>
					)}
					<span
						className={cn(
							"col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80",
							truncate
								? "block truncate"
								: "[text-box:trim-both_cap_alphabetic]",
							isActive || checked ? "text-foreground" : "text-muted-foreground",
						)}
						style={{
							fontVariationSettings: checked
								? fontWeights.semibold
								: fontWeights.normal,
						}}
					>
						{label}
					</span>
				</span>
				{trailing != null && (
					<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
						{trailing}
					</span>
				)}
				<AnimatePresence>
					{checked && (
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
							className="shrink-0 text-foreground"
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
			</>
		);

		if (renderMenuItem) {
			return renderMenuItem({
				radio: !isCheckbox && typeof checked === "boolean",
				checkbox: isCheckbox,
				checked,
				value: index,
				disabled,
				label,
				closeOnClick: closeOnClick ?? !multiple,
				element: (
					<div
						ref={mergeRef}
						data-fluid-hover-index={index}
						aria-label={label}
						onClick={handleActivate}
						className={itemClassName}
						{...props}
					/>
				),
				children: content,
			});
		}

		return (
			<div
				ref={mergeRef}
				data-fluid-hover-index={index}
				tabIndex={
					!disabled && index === (checkedIndex ?? checkedIndices?.[0] ?? 0)
						? 0
						: -1
				}
				role={
					isCheckbox
						? "menuitemcheckbox"
						: typeof checked === "boolean"
							? "menuitemradio"
							: "menuitem"
				}
				aria-checked={typeof checked === "boolean" ? checked : undefined}
				aria-disabled={disabled || undefined}
				aria-label={label}
				onClick={handleActivate}
				onKeyDown={(e) => {
					if (disabled) return;
					if (e.key === " " || e.key === "Enter") {
						e.preventDefault();
						onSelect?.();
					}
				}}
				className={itemClassName}
				{...props}
			>
				{content}
			</div>
		);
	},
);

MenuItem.displayName = "MenuItem";

export { MenuItem };
export default MenuItem;
