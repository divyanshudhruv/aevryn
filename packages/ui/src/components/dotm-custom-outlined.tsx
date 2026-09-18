"use client";

import type {
	DotAnimationResolver,
	DotMatrixCommonProps,
} from "@aevryn/ui/lib/dotmatrix-core";
import { useMemo } from "react";
import { DotMatrixBase, isWithinCircularMask } from "../lib/dotmatrix-core";
import {
	useDotMatrixPhases,
	usePrefersReducedMotion,
} from "../lib/dotmatrix-hooks";

export type DotmCustomOutlinedProps = DotMatrixCommonProps;

const BASE_OPACITY = 0.08;
const SIDE_OPACITY = 0.28;

const RING_OPACITY = 0.85;

export function DotmCustomOutlined({
	speed = 1.55,
	animated = true,
	hoverAnimated = false,
	...rest
}: DotmCustomOutlinedProps) {
	const reducedMotion = usePrefersReducedMotion();
	const {
		phase: matrixPhase,
		onMouseEnter,
		onMouseLeave,
	} = useDotMatrixPhases({
		animated: Boolean(animated && !reducedMotion),
		hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
		speed,
	});
	const resolver = useMemo<DotAnimationResolver>(() => {
		return ({ row, col }) => {
			if (!isWithinCircularMask(row, col)) {
				return { className: "dmx-inactive" };
			}

			const centerRow = row - 2;
			const centerCol = col - 2;
			const radius = Math.hypot(centerRow, centerCol);
			const distance = Math.sqrt((col - radius) ** 2 + (row - radius) ** 2);

			if (radius > 1.6 && radius < 2.3) {
				return { style: { opacity: RING_OPACITY } };
			}
			if (radius > 1 && radius < 1.6) {
				return { style: { opacity: SIDE_OPACITY } };
			}

			if (distance <= radius + 2) {
				return { style: { opacity: SIDE_OPACITY } };
			}

			return { style: { opacity: BASE_OPACITY } };
		};
	}, []);

	return (
		<DotMatrixBase
			{...rest}
			size={rest.size ?? 36}
			dotSize={rest.dotSize ?? 5}
			speed={speed}
			pattern="full"
			animated={animated}
			phase={matrixPhase}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			reducedMotion={reducedMotion}
			animationResolver={resolver}
		/>
	);
}
