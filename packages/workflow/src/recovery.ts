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
	"ANAKIN_RATE_LIMIT",
	"ANAKIN_SERVER_ERROR",
	"ANAKIN_NETWORK_ERROR",
	"ANAKIN_JOB_TIMEOUT",
	"ANAKIN_TIMEOUT",
	"ANAKIN_PARTIAL_RESULT",
	"EXECUTION_TIME_BUDGET_EXCEEDED",
	"EXECUTION_TOOL_BUDGET_EXCEEDED",
]);

/**
 * Structural failures mean the current approach cannot work as-is; the model
 * should change strategy (different API/format/session), not blindly retry.
 * They still get one bounded recovery pass so the agent can adapt.
 */
const STRUCTURAL_CODES = new Set([
	"ANAKIN_JOB_FAILED",
	"ANAKIN_JOB_REJECTED",
	"ANAKIN_NOT_FOUND",
	"ANAKIN_AUTHENTICATION_FAILED",
	"ANAKIN_FORBIDDEN",
	"ANAKIN_INVALID_REQUEST",
	"ANAKIN_UNSUPPORTED_PAGE",
	"ANAKIN_WIRE_AUTH_REQUIRED",
	"ANAKIN_WIRE_ACTION_REJECTED",
	"SCRAPE_EMPTY_CONTENT",
	"CRAWL_NO_URLS",
	"SEARCH_NO_RESULTS",
]);

/**
 * Retrying after these cannot help: the failure is permanent (bad config,
 * exhausted credits, blown cost budget) or the run must stop for the user.
 */
const FATAL_CODES = new Set([
	"ANAKIN_INSUFFICIENT_CREDITS",
	"ANAKIN_CONFIGURATION_INVALID",
	"EXECUTION_COST_BUDGET_EXCEEDED",
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
	if (FATAL_CODES.has(code)) {
		return { failureClass: "fatal", failureCode: code, retryable: false };
	}
	if (input.retryable) {
		return { failureClass: "transient", failureCode: code, retryable: true };
	}
	return { failureClass: "fatal", failureCode: code, retryable: false };
}
