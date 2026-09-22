"use client";

import {
	useFluidHover,
	useRegisterFluidHoverItem,
} from "@aevryn/ui/hooks/use-fluid-hover";
import { fontWeights } from "@aevryn/ui/lib/font-weight";
import type { IconComponent } from "@aevryn/ui/lib/icon-context";
import { useShape } from "@aevryn/ui/lib/shape-context";
import {
	SizeProvider,
	type SizeVariant,
	useSize,
} from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import { Field } from "@base-ui/react/field";
import {
	createContext,
	forwardRef,
	type HTMLAttributes,
	type InputHTMLAttributes,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";

interface InputGroupContextValue {
	registerItem: (index: number, element: HTMLElement | null) => void;
	activeIndex: number | null;
}

const InputGroupContext = createContext<InputGroupContextValue | null>(null);

function useInputGroup() {
	const ctx = useContext(InputGroupContext);
	if (!ctx) throw new Error("useInputGroup must be used within an InputGroup");
	return ctx;
}

interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	size?: SizeVariant;
}

const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
	({ children, size, className, ...props }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);

		const { activeIndex, handlers, registerItem } = useFluidHover(containerRef);

		const contextValue = useMemo(
			() => ({ registerItem, activeIndex }),
			[registerItem, activeIndex],
		);

		const group = (
			<InputGroupContext.Provider value={contextValue}>
				<div
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
					className={cn(
						"relative flex w-72 max-w-full flex-col gap-3",
						className,
					)}
					{...props}
				>
					{children}
				</div>
			</InputGroupContext.Provider>
		);

		return size ? <SizeProvider size={size}>{group}</SizeProvider> : group;
	},
);

InputGroup.displayName = "InputGroup";

interface InputFieldProps
	extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "index"> {
	label: string;

	labelHidden?: boolean;
	placeholder?: string;
	icon?: IconComponent;
	index: number;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	disabled?: boolean;
	className?: string;
}

const InputField = forwardRef<HTMLDivElement, InputFieldProps>(
	(
		{
			label,
			labelHidden,
			placeholder,
			icon: Icon,
			index,
			value,
			onChange,
			error,
			disabled,
			className,
			...props
		},
		ref,
	) => {
		const internalRef = useRef<HTMLDivElement>(null);
		const inputRef = useRef<HTMLElement | null>(null);
		const { registerItem, activeIndex } = useInputGroup();
		const [isFocused, setIsFocused] = useState(false);
		const shape = useShape();
		const sizeClasses = useSize();
		const compact = sizeClasses.variant === "compact";

		useRegisterFluidHoverItem(registerItem, index, internalRef);

		const isActive = activeIndex === index;
		const labelActive = isActive || isFocused;

		const handleFocus = () => {
			setIsFocused(true);
		};

		const handleBlur = () => {
			setIsFocused(false);
		};

		let bgClass: string;
		let ringClass: string;

		if (disabled) {
			bgClass = "bg-transparent";
			ringClass = "ring-border";
		} else if (error) {
			bgClass = isFocused
				? "bg-card"
				: isActive
					? "bg-destructive-light/60"
					: "bg-transparent";
			ringClass =
				isFocused || isActive ? "ring-destructive/50" : "ring-transparent";
		} else if (isFocused) {
			bgClass = "bg-card";
			ringClass = "ring-border";
		} else if (isActive) {
			bgClass = "bg-muted/50";
			ringClass = "ring-border";
		} else {
			bgClass = "bg-transparent";
			ringClass = "ring-transparent";
		}

		return (
			<Field.Root
				ref={(node) => {
					(
						internalRef as React.MutableRefObject<HTMLDivElement | null>
					).current = node;
					if (typeof ref === "function") ref(node);
					else if (ref)
						(ref as React.MutableRefObject<HTMLDivElement | null>).current =
							node;
				}}
				invalid={!!error}
				disabled={disabled}
				className={cn(
					"flex cursor-text flex-col gap-1",
					disabled && "pointer-events-none opacity-50",
					className,
				)}
			>
				<Field.Label
					className={cn(
						labelHidden ? "sr-only" : "inline-grid",
						sizeClasses.text,
						!labelHidden && (compact ? "pl-2" : "pl-2.5"),
					)}
				>
					<span
						className="invisible col-start-1 row-start-1"
						style={{ fontVariationSettings: fontWeights.semibold }}
						aria-hidden="true"
					>
						{label}
					</span>
					<span
						className={cn(
							"col-start-1 row-start-1",
							error ? "text-destructive" : "text-muted-foreground",
						)}
						style={{
							fontVariationSettings: fontWeights.normal,
						}}
					>
						{label}
					</span>
				</Field.Label>

				<div
					onMouseDown={(e) => {
						if (e.target === inputRef.current) return;
						e.preventDefault();
						inputRef.current?.focus();
					}}
					className={cn(
						`flex items-center ${sizeClasses.gap} ${shape.input} ${
							compact ? "px-2" : "px-2.5"
						} ${sizeClasses.control} ring-1 transition-all duration-80`,
						bgClass,
						ringClass,
					)}
				>
					{Icon && (
						<Icon
							size={sizeClasses.icon}
							strokeWidth={labelActive ? 2 : 1.5}
							className={cn(
								"shrink-0 transition-[color,stroke-width] duration-80",
								labelActive ? "text-foreground" : "text-muted-foreground",
							)}
						/>
					)}
					<Field.Control
						ref={inputRef}
						type="text"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onFocus={handleFocus}
						onBlur={handleBlur}
						placeholder={placeholder}
						className={cn(
							"w-full rounded-none bg-transparent font-[inherit] text-foreground outline-none placeholder:text-muted-foreground",
							sizeClasses.text,
						)}
						style={{ fontVariationSettings: fontWeights.normal }}
						{...props}
					/>
				</div>

				{error && (
					<Field.Error
						match
						className={cn(
							"text-destructive",
							compact ? "pl-2 text-[11px]" : "pl-2.5 text-[12px]",
						)}
						style={{ fontVariationSettings: fontWeights.medium }}
					>
						{error}
					</Field.Error>
				)}
			</Field.Root>
		);
	},
);

InputField.displayName = "InputField";

export { InputField, InputGroup };
export default InputGroup;
