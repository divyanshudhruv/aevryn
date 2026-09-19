"use client";

import { useShape } from "@aevryn/ui/lib/shape-context";
import { useSizeVariant } from "@aevryn/ui/lib/size-context";
import { cn } from "@aevryn/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { useTheme } from "next-themes";
import { forwardRef, type HTMLAttributes, useEffect, useState } from "react";

const badgeColors = {
	gray: "#a3a3a3",
	red: "#ef4444",
	orange: "#f97316",
	amber: "#f59e0b",
	yellow: "#eab308",
	lime: "#84cc16",
	green: "#22c55e",
	emerald: "#10b981",
	teal: "#14b8a6",
	cyan: "#06b6d4",
	blue: "#3b82f6",
	indigo: "#6366f1",
	violet: "#8b5cf6",
	purple: "#a855f7",
	fuchsia: "#d946ef",
	pink: "#ec4899",
	rose: "#f43f5e",
} as const;

type BadgeColor = keyof typeof badgeColors;

const badgeVariants = cva(
	"inline-flex shrink-0 items-center whitespace-nowrap font-medium",
	{
		variants: {
			variant: {
				solid: "",
				dot: "border border-border text-foreground",
			},
			// The two-step size ladder shared by every control — see /docs/sizes.
			size: {
				default: "h-6 gap-1.5 px-2.5 text-[12px]",
				compact: "h-5 gap-1 px-2 text-[11px]",
			},
		},
		defaultVariants: {
			variant: "solid",
			size: "default",
		},
	},
);

type BadgeSizeCanonical = "default" | "compact";

/** Public size values: the canonical two-size scale plus the pre-sizes-system
 *  aliases, kept so existing call sites keep compiling. Aliases resolve onto
 *  the canonical ladder (sm → compact; md/lg → default). */
type BadgeSize = BadgeSizeCanonical | "sm" | "md" | "lg";

const legacySizeAliases: Partial<Record<BadgeSize, BadgeSizeCanonical>> = {
	sm: "compact",
	md: "default",
	lg: "default",
};

interface BadgeProps
	extends Omit<HTMLAttributes<HTMLSpanElement>, "color">,
		Omit<VariantProps<typeof badgeVariants>, "size"> {
	color?: BadgeColor;
	/** Omitted, the badge follows the surrounding SizeProvider. Legacy
	 *  sm/md/lg values still resolve. */
	size?: BadgeSize;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
	(
		{
			className,
			variant = "solid",
			size: sizeProp,
			color = "gray",
			children,
			style,
			...props
		},
		ref,
	) => {
		const shape = useShape();
		// Resolve the size: explicit prop (legacy aliases mapped onto the
		// canonical ladder) > surrounding SizeProvider > default.
		const contextSize = useSizeVariant();
		const size: BadgeSizeCanonical = sizeProp
			? (legacySizeAliases[sizeProp] ?? (sizeProp as BadgeSizeCanonical))
			: contextSize === "compact"
				? "compact"
				: "default";
		const colorValue = badgeColors[color];
		const isSolid = variant === "solid";
		const dotSize = size === "compact" ? 6 : 7;
		// `resolvedTheme` is undefined during SSR and on the first client pass, so
		// deriving textMix from it makes the server HTML disagree with the hydrated
		// tree (different color-mix() ratios) and produces the attribute mismatch.
		// Hold the theme-dependent style until after hydration agrees on the theme.
		const { resolvedTheme } = useTheme();
		const [mounted, setMounted] = useState(false);
		useEffect(() => setMounted(true), []);
		const textMix = mounted && resolvedTheme === "dark" ? 75 : 45;

		const colorStyle =
			!mounted || !isSolid
				? {}
				: color === "gray"
					? { backgroundColor: "var(--accent)", color: "var(--foreground)" }
					: {
							color: `color-mix(in srgb, ${colorValue} ${textMix}%, black)`,
							backgroundColor: `color-mix(in srgb, ${colorValue} 15%, var(--background))`,
						};

		const dotColor = color === "gray" ? "var(--muted-foreground)" : colorValue;

		return (
			<span
				ref={ref}
				className={cn(badgeVariants({ variant, size }), shape.item, className)}
				style={{ ...colorStyle, ...style }}
				{...props}
			>
				{!isSolid && (
					<span
						className="shrink-0 rounded-full"
						style={{
							width: dotSize,
							height: dotSize,
							backgroundColor: dotColor,
						}}
					/>
				)}
				{/* text-box needs a block container — the badge root is a flex
            container, so the label gets its own span. Height is fixed (h-*),
            so trimming only recenters the letterforms. */}
				<span className="[text-box:trim-both_cap_alphabetic]">
					{children}
				</span>
			</span>
		);
	},
);

Badge.displayName = "Badge";

export type { BadgeColor, BadgeProps, BadgeSize };
export { Badge, badgeColors, badgeVariants };
