"use client";

import { surfaceClasses } from "@aevryn/ui/lib/surface-classes";
import { SurfaceProvider, useSurface } from "@aevryn/ui/lib/surface-context";
import { cn } from "@aevryn/ui/lib/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	type ReactNode,
} from "react";

interface ElevatedProps extends ComponentPropsWithoutRef<"div"> {
	offset: number;
	shadowLevel?: number;
	children?: ReactNode;
}

const Elevated = forwardRef<HTMLDivElement, ElevatedProps>(
	({ offset, shadowLevel, className, children, ...props }, ref) => {
		const substrate = useSurface();
		const level = Math.min(substrate + offset, 8);
		return (
			<SurfaceProvider value={level}>
				<div
					ref={ref}
					className={cn(surfaceClasses(level, shadowLevel ?? level), className)}
					{...props}
				>
					{children}
				</div>
			</SurfaceProvider>
		);
	},
);
Elevated.displayName = "Elevated";

export { Elevated };
