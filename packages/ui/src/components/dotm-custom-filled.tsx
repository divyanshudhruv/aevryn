"use client";

import { useMemo } from "react";

import { DotMatrixBase } from "../lib/dotmatrix-core";
import { useDotMatrixPhases } from "../lib/dotmatrix-hooks";
import { isWithinCircularMask } from "../lib/dotmatrix-core";
import { useCyclePhase } from "../lib/dotmatrix-hooks";
import { usePrefersReducedMotion } from "../lib/dotmatrix-hooks";
import type {
  DotAnimationResolver,
  DotMatrixCommonProps,
} from "../lib/dotmatrix-core";

export type DotmCustomFilledProps = DotMatrixCommonProps;

const BASE_OPACITY = 0.07;
const RUNG_OPACITY = 0.95;
const SIDE_OPACITY = 0.56;
const GHOST_OPACITY = 0.28;

export function DotmCustomFilled({
  speed = 1,
  animated = true,
  hoverAnimated = false,
  ...rest
}: DotmCustomFilledProps) {
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
    return ({ row, col, phase }) => {
      if (!isWithinCircularMask(row, col)) {
        return { className: "dmx-inactive" };
      }

      const radius = 2;
      const distance = Math.sqrt((col - radius) ** 2 + (row - radius) ** 2);

      let opacity = BASE_OPACITY;
      if (distance <= radius) {
        opacity = RUNG_OPACITY;
      } else if (distance <= radius + 1) {
        opacity = SIDE_OPACITY;
      } else if (distance <= radius + 2) {
        opacity = GHOST_OPACITY;
      }

      return { style: { opacity } };
    };
  }, []);

  return (
    <DotMatrixBase
      {...rest}
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
