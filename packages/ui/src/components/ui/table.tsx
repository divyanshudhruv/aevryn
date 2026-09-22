"use client";

import { FluidHoverHighlight } from "@aevryn/ui/components/fluid-hover-highlight";
import {
	type ItemRectMeasure,
	useFluidHover,
	useRegisterFluidHoverItem,
} from "@aevryn/ui/hooks/use-fluid-hover";
import { fontWeights } from "@aevryn/ui/lib/font-weight";
import {
	SizeProvider,
	type SizeVariant,
	useSize,
} from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import {
	createContext,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	type TdHTMLAttributes,
	type ThHTMLAttributes,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";

const measureRowRect: ItemRectMeasure = (element, container) => {
	const el = element.getBoundingClientRect();
	const box = container.getBoundingClientRect();
	return {
		top: el.top - box.top + container.scrollTop - container.clientTop,
		left: el.left - box.left + container.scrollLeft - container.clientLeft,
		width: el.width,
		height: el.height,
	};
};

interface TableContextValue {
	registerItem: (index: number, element: HTMLElement | null) => void;
	activeIndex: number | null;
	registerHead: (element: HTMLElement | null) => void;
	activeCol: number | null;
}

const TableContext = createContext<TableContextValue | null>(null);

interface TableProps extends HTMLAttributes<HTMLTableElement> {
	children: ReactNode;
	size?: SizeVariant;
}

const Table = forwardRef<HTMLTableElement, TableProps>(
	({ children, size, className, ...props }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const sizeClasses = useSize(size);

		const hover = useFluidHover(containerRef, { measureRect: measureRowRect });
		const colHover = useFluidHover(containerRef, {
			axis: "x",
			measureRect: measureRowRect,
			gapClick: false,
		});
		const { activeIndex, handlers, registerItem } = hover;
		const { activeIndex: activeCol, registerItem: registerCol } = colHover;

		const headCounter = useRef(0);
		const registerHead = useCallback(
			(element: HTMLElement | null) => {
				if (element) {
					registerCol(headCounter.current++, element);
				}
			},
			[registerCol],
		);

		const contextValue = useMemo(
			() => ({ registerItem, activeIndex, registerHead, activeCol }),
			[registerItem, activeIndex, registerHead, activeCol],
		);

		const table = (
			<TableContext.Provider value={contextValue}>
				{" "}
				<div
					ref={containerRef}
					className="relative w-full max-w-full overflow-x-auto"
					onMouseEnter={handlers.onMouseEnter}
					onMouseMove={handlers.onMouseMove}
					onMouseLeave={handlers.onMouseLeave}
					onClick={handlers.onClick}
				>
					<FluidHoverHighlight hover={colHover} className="bg-hover/50" />
					<FluidHoverHighlight hover={hover} />

					<table
						ref={ref}
						className={cn(
							"min-w-full border-collapse",
							sizeClasses.text,
							className,
						)}
						{...props}
					>
						{children}
					</table>
				</div>
			</TableContext.Provider>
		);

		return size ? <SizeProvider size={size}>{table}</SizeProvider> : table;
	},
);

Table.displayName = "Table";

const TableHeader = forwardRef<
	HTMLTableSectionElement,
	HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<thead ref={ref} className={cn("", className)} {...props} />
));

TableHeader.displayName = "TableHeader";

const TableBody = forwardRef<
	HTMLTableSectionElement,
	HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tbody ref={ref} className={cn("", className)} {...props} />
));

TableBody.displayName = "TableBody";

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
	index?: number;
}

const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
	({ index, className, style, ...props }, ref) => {
		const internalRef = useRef<HTMLTableRowElement>(null);
		const ctx = useContext(TableContext);

		useRegisterFluidHoverItem(ctx?.registerItem, index, internalRef);

		const isBodyRow = index !== undefined;
		const activeIdx = ctx?.activeIndex ?? null;
		const hideBorder =
			activeIdx !== null &&
			((isBodyRow && (index === activeIdx || index === activeIdx - 1)) ||
				(!isBodyRow && activeIdx === 0));

		return (
			<tr
				ref={(node) => {
					(
						internalRef as React.MutableRefObject<HTMLTableRowElement | null>
					).current = node;
					if (typeof ref === "function") ref(node);
					else if (ref)
						(
							ref as React.MutableRefObject<HTMLTableRowElement | null>
						).current = node;
				}}
				data-fluid-hover-index={index}
				className={cn(
					"group/row relative z-10 border-b transition-[border-color] duration-80",
					hideBorder ? "border-transparent" : "border-accent/40",
					isBodyRow && activeIdx === index && "is-active bg-hover",
					className,
				)}
				style={{
					...style,
					fontVariationSettings: isBodyRow
						? fontWeights.normal
						: fontWeights.semibold,
				}}
				{...props}
			/>
		);
	},
);

TableRow.displayName = "TableRow";

const TableHead = forwardRef<
	HTMLTableCellElement,
	ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
	const sizeClasses = useSize();
	const ctx = useContext(TableContext);
	const internalRef = useRef<HTMLTableCellElement>(null);
	useEffect(() => {
		ctx?.registerHead(internalRef.current);
	}, [ctx]);
	return (
		<th
			ref={(node) => {
				(
					internalRef as React.MutableRefObject<HTMLTableCellElement | null>
				).current = node;
				if (typeof ref === "function") ref(node);
				else if (ref)
					(ref as React.MutableRefObject<HTMLTableCellElement | null>).current =
						node;
			}}
			className={cn(
				"text-left font-[300] text-foreground",
				sizeClasses.variant === "compact" ? "px-2.5 py-[5px]" : "px-3 py-2",
				className,
			)}
			{...props}
		/>
	);
});

TableHead.displayName = "TableHead";

const TableCell = forwardRef<
	HTMLTableCellElement,
	TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
	const sizeClasses = useSize();
	return (
		<td
			ref={ref}
			className={cn(
				"text-muted-foreground transition-colors duration-80 group-[.is-active]/row:text-foreground",
				sizeClasses.variant === "compact" ? "px-2.5 py-[5px]" : "px-3 py-2",
				className,
			)}
			{...props}
		/>
	);
});

TableCell.displayName = "TableCell";

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
