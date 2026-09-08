import {
	AnakinError,
	AuthenticationError,
	ConfigurationError,
	ForbiddenError,
	InsufficientCreditsError,
	InvalidRequestError,
	JobFailedError,
	JobTimeoutError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	ServerError,
	WireAuthRequiredError,
} from "@anakin-io/sdk";

import type { CapabilityFailure } from "./capability";

function failureClass(
	error: unknown,
): CapabilityFailure["error"]["failureClass"] {
	if (error instanceof WireAuthRequiredError) return "recoverable";
	if (error instanceof JobFailedError) return "recoverable";
	if (error instanceof NotFoundError) return "recoverable";
	if (error instanceof RateLimitError) return "retryable";
	if (error instanceof ServerError) return "retryable";
	if (error instanceof NetworkError) return "retryable";
	if (error instanceof JobTimeoutError) return "retryable";
	return "fatal";
}

function stableErrorCode(error: unknown): string {
	if (error instanceof RateLimitError) return "ANAKIN_RATE_LIMITED";
	if (error instanceof InsufficientCreditsError)
		return "ANAKIN_INSUFFICIENT_CREDITS";
	if (error instanceof WireAuthRequiredError)
		return "ANAKIN_WIRE_AUTH_REQUIRED";
	if (error instanceof AuthenticationError)
		return "ANAKIN_AUTHENTICATION_FAILED";
	if (error instanceof ConfigurationError)
		return "ANAKIN_CONFIGURATION_INVALID";
	if (error instanceof ForbiddenError) return "ANAKIN_FORBIDDEN";
	if (error instanceof InvalidRequestError) return "ANAKIN_INVALID_REQUEST";
	if (error instanceof NotFoundError) return "ANAKIN_NOT_FOUND";
	if (error instanceof ServerError) return "ANAKIN_SERVER_ERROR";
	if (error instanceof NetworkError) return "ANAKIN_NETWORK_ERROR";
	if (error instanceof JobTimeoutError) return "ANAKIN_JOB_TIMEOUT";
	if (error instanceof JobFailedError) return "ANAKIN_JOB_FAILED";
	if (error instanceof AnakinError) return "ANAKIN_ERROR";
	return "UNKNOWN_ERROR";
}

function providerFor(
	error: unknown,
	durationMs?: number,
): CapabilityFailure["provider"] {
	if (!(error instanceof AnakinError)) return { id: "anakin", durationMs };
	return {
		id: "anakin",
		requestId: error.requestId,
		operation: error.code,
		durationMs,
	};
}

export function toCapabilityFailure(
	error: unknown,
	durationMs?: number,
): CapabilityFailure {
	const message = error instanceof Error ? error.message : "Unknown error";
	return {
		ok: false,
		error: {
			code: stableErrorCode(error),
			message,
			failureClass: failureClass(error),
			retryable: failureClass(error) === "retryable",
		},
		provider: providerFor(error, durationMs),
	};
}
