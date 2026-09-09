import { z } from "zod";

export const failureClassSchema = z.enum(["transient", "structural", "fatal"]);

export type FailureClass = z.infer<typeof failureClassSchema>;

export const recoveryStatusSchema = z.enum(["started", "completed", "failed"]);

export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;

export interface FailureClassification {
	failureClass: FailureClass;
	failureCode: string;
	retryable: boolean;
}

const RETRYABLE_CODES = new Set([
	"ANAKIN_RATE_LIMITED",
	"ANAKIN_SERVER_ERROR",
	"ANAKIN_NETWORK_ERROR",
	"ANAKIN_JOB_TIMEOUT",
]);

const STRUCTURAL_CODES = new Set([
	"ANAKIN_JOB_FAILED",
	"ANAKIN_NOT_FOUND",
	"ANAKIN_WIRE_AUTH_REQUIRED",
]);

/**
 * Classify a failure from its stable machine code. Human-readable messages are
 * deliberately ignored: retrying on a message heuristic can loop forever. Unknown
 * codes fail safe (fatal) instead of guessing.
 */
export function classifyFailure(input: {
	code?: string | null;
	retryable?: boolean;
}): FailureClassification {
	const code = input.code ?? "UNKNOWN_ERROR";
	if (RETRYABLE_CODES.has(code)) {
		return { failureClass: "transient", failureCode: code, retryable: true };
	}
	if (STRUCTURAL_CODES.has(code)) {
		return {
			failureClass: "structural",
			failureCode: code,
			retryable: false,
		};
	}
	if (input.retryable) {
		return { failureClass: "transient", failureCode: code, retryable: true };
	}
	return { failureClass: "fatal", failureCode: code, retryable: false };
}
