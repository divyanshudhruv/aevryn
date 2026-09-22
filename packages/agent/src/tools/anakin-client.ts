import { db, decryptSecret, userKeys } from "@aevryn/db";
import {
	Anakin,
	AnakinError,
	InsufficientCreditsError,
	RateLimitError,
	WireAuthRequiredError,
} from "@anakin-io/sdk";
import { and, eq } from "drizzle-orm";

export interface ToolError {
	ok: false;
	error: {
		code: string;
		message: string;
		retryable?: boolean;
		signupUrl?: string;
		connectUrl?: string;
		balance?: number;
		required?: number;
		retryAfterSeconds?: number;
	};
}

export type ToolResult<T> = ({ ok: true } & T) | ToolError;

export const ANAKIN_BASE_URL = "https://api.anakin.io/v1";

export async function resolveAnakinKey(userId: string): Promise<string | null> {
	const rows = await db
		.select({ encryptedValue: userKeys.encryptedValue })
		.from(userKeys)
		.where(and(eq(userKeys.userId, userId), eq(userKeys.name, "anakin")));
	const row = rows[0];
	if (!row) return null;
	try {
		return decryptSecret(row.encryptedValue);
	} catch {
		return null;
	}
}

export function anakinClient(apiKey: string): Anakin {
	return new Anakin({
		apiKey,
		pollIntervalMs: 2_000,
		pollMaxIntervalMs: 10_000,
		pollTimeoutMs: 5 * 60_000,
		maxRetries: 3,
	});
}

export function requireKey(
	anakinKey: string | null,
): { ok: true; apiKey: string } | ToolError {
	if (!anakinKey) {
		return {
			ok: false,
			error: {
				code: "ANAKIN_KEY_REQUIRED",
				message:
					"This tool needs your Anakin API key. Add it in Settings → BYOK (free signup includes 300 credits). Scraping a single URL and read-only Wire actions work without a key — try those instead.",
			},
		};
	}
	return { ok: true, apiKey: anakinKey };
}

const CODE_MAP: Record<string, { code: string; retryable?: boolean }> = {
	invalid_request: { code: "INVALID_REQUEST" },
	invalid_url: { code: "INVALID_REQUEST" },
	invalid_job_type: { code: "INVALID_REQUEST" },
	blocked_website: { code: "INVALID_REQUEST" },
	unauthorized: { code: "AUTH_UNAUTHORIZED" },
	forbidden: { code: "FORBIDDEN" },
	not_found: { code: "NOT_FOUND" },
	session_in_use: { code: "RESOURCE_CONFLICT" },
	duplicate_name: { code: "RESOURCE_CONFLICT" },
	action_exists: { code: "RESOURCE_CONFLICT" },
	session_not_saved: { code: "RESOURCE_NOT_READY" },
	server_error: { code: "SERVER_ERROR", retryable: true },
	queue_error: { code: "SERVER_ERROR", retryable: true },
	configuration_error: { code: "SERVER_ERROR", retryable: true },
	internal_error: { code: "SERVER_ERROR", retryable: true },
	execution_failed: { code: "SERVER_ERROR", retryable: true },
	search_error: { code: "SEARCH_ERROR" },
	service_unavailable: { code: "SERVICE_UNAVAILABLE", retryable: true },
	action_unavailable: { code: "SERVICE_UNAVAILABLE", retryable: true },
	insufficient_credits: { code: "ANAKIN_OUT_OF_CREDITS" },
	rate_limit_exceeded: { code: "RATE_LIMITED" },
	build_limit_reached: { code: "RATE_LIMITED" },
};

const STATUS_MAP: Record<number, { code: string; retryable?: boolean }> = {
	400: { code: "INVALID_REQUEST" },
	401: { code: "AUTH_UNAUTHORIZED" },
	402: { code: "ANAKIN_OUT_OF_CREDITS" },
	403: { code: "FORBIDDEN" },
	404: { code: "NOT_FOUND" },
	409: { code: "RESOURCE_CONFLICT" },
	422: { code: "RESOURCE_NOT_READY" },
	429: { code: "RATE_LIMITED" },
	500: { code: "SERVER_ERROR", retryable: true },
	502: { code: "SERVER_ERROR", retryable: true },
	503: { code: "SERVICE_UNAVAILABLE", retryable: true },
};

function readErrorBody(err: unknown): Record<string, unknown> | undefined {
	const body = (err as { body?: unknown }).body;
	if (body != null && typeof body === "object") {
		return body as Record<string, unknown>;
	}
	return undefined;
}

function readErrorCode(err: unknown): string | undefined {
	if (err instanceof AnakinError && typeof err.code === "string") {
		return err.code;
	}
	const body = readErrorBody(err);
	if (!body) return undefined;
	if (typeof body.error === "string") return body.error;
	if (body.error != null && typeof body.error === "object") {
		const nested = body.error as Record<string, unknown>;
		if (typeof nested.code === "string") return nested.code;
	}
	if (typeof body.code === "string") return body.code;
	return undefined;
}

function readStatusCode(err: unknown): number | undefined {
	const direct = (err as { statusCode?: unknown }).statusCode;
	if (typeof direct === "number") return direct;
	if (err instanceof AnakinError && typeof err.statusCode === "number") {
		return err.statusCode;
	}
	return undefined;
}

function readErrorMessage(
	err: unknown,
	body?: Record<string, unknown>,
): string {
	if (body) {
		if (typeof body.message === "string") return body.message;
		if (body.error != null && typeof body.error === "object") {
			const nested = body.error as Record<string, unknown>;
			if (typeof nested.message === "string") return nested.message;
		}
	}
	return err instanceof Error ? err.message : String(err);
}

export function mapAnakinError(err: unknown): ToolError {
	if (err instanceof WireAuthRequiredError) {
		return {
			ok: false,
			error: {
				code: "AUTH_REQUIRED",
				message: `${err.message} Connect the account first (one click, opens Anakin's secure connect flow), then retry.`,
				connectUrl: err.connectUrl,
			},
		};
	}
	if (err instanceof InsufficientCreditsError) {
		return {
			ok: false,
			error: {
				code: "ANAKIN_OUT_OF_CREDITS",
				message: `Not enough Anakin credits${err.required != null ? ` — this needs ${err.required}` : ""}${err.balance != null ? `, balance is ${err.balance}` : ""}. Top up or sign up at anakin.io/signup for 300 free credits.`,
				balance: err.balance,
				required: err.required,
				signupUrl: "https://anakin.io/signup",
			},
		};
	}
	if (err instanceof RateLimitError) {
		return {
			ok: false,
			error: {
				code: "RATE_LIMITED",
				message: `Anakin rate limit hit${err.retryAfter != null ? ` — retry in ${err.retryAfter}s` : ""}.`,
				retryAfterSeconds: err.retryAfter,
			},
		};
	}

	const statusCode = readStatusCode(err);
	if (err instanceof AnakinError && statusCode === 402) {
		const body = (err.body ?? {}) as { signup_url?: string };
		return {
			ok: false,
			error: {
				code: "ANAKIN_OUT_OF_CREDITS",
				message:
					"The free Zero-Touch allowance for your network is used up. Add your Anakin key in Settings → BYOK (300 free credits) to continue.",
				signupUrl: body.signup_url ?? "https://anakin.io/signup",
			},
		};
	}

	const body = readErrorBody(err);
	const rawCode = readErrorCode(err);
	const normalized = rawCode?.toLowerCase();

	if (normalized === "unauthorized" || normalized === "auth_expired") {
		return {
			ok: false,
			error: {
				code: "AUTH_UNAUTHORIZED",
				message:
					normalized === "auth_expired"
						? `${readErrorMessage(err, body)} Reconnect the account in the Wire dashboard, then retry.`
						: `${readErrorMessage(err, body)} Check your Anakin key in Settings → BYOK.`,
			},
		};
	}
	if (normalized === "auth_required") {
		const connectUrl =
			body?.error != null &&
			typeof body.error === "object" &&
			typeof (body.error as Record<string, unknown>).connect_url === "string"
				? ((body.error as Record<string, unknown>).connect_url as string)
				: undefined;
		return {
			ok: false,
			error: {
				code: "AUTH_REQUIRED",
				message: `${readErrorMessage(err, body)} Connect the account first, then retry.`,
				...(connectUrl ? { connectUrl } : {}),
			},
		};
	}
	if (normalized && normalized in CODE_MAP) {
		const mapped = CODE_MAP[normalized]!;
		return {
			ok: false,
			error: {
				code: mapped.code,
				message: readErrorMessage(err, body),
				...(mapped.retryable != null ? { retryable: mapped.retryable } : {}),
			},
		};
	}

	if (statusCode != null && statusCode in STATUS_MAP) {
		const mapped = STATUS_MAP[statusCode]!;
		return {
			ok: false,
			error: {
				code: mapped.code,
				message: readErrorMessage(err, body),
				...(mapped.retryable != null ? { retryable: mapped.retryable } : {}),
			},
		};
	}

	if (err instanceof AnakinError) {
		return {
			ok: false,
			error: {
				code: err.code ?? `ANAKIN_${statusCode ?? "ERROR"}`,
				message: err.message,
			},
		};
	}

	return {
		ok: false,
		error: {
			code: statusCode != null ? `ANAKIN_${statusCode}` : "TOOL_FAILED",
			message: err instanceof Error ? err.message : String(err),
		},
	};
}

const RETRYABLE_STATUSES = new Set([500, 502, 503]);
const MAX_RAW_RETRIES = 3;

function isTimeoutError(err: unknown): boolean {
	const name = (err as { name?: unknown }).name;
	return name === "TimeoutError" || name === "AbortError";
}

function parseRetryAfter(response: Response): number | undefined {
	const header = response.headers.get("Retry-After");
	if (!header) return undefined;
	const seconds = Number(header);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function backoffDelayMs(attempt: number, retryAfterSeconds?: number): number {
	if (retryAfterSeconds != null) return retryAfterSeconds * 1_000;
	const base = 500 * 2 ** attempt;
	return base + Math.random() * 250;
}

async function fetchWithRetry(
	url: string,
	init: RequestInit,
	maxRetries = MAX_RAW_RETRIES,
): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await fetch(url, init);
			const retryableStatus =
				response.status === 429 || RETRYABLE_STATUSES.has(response.status);
			if (retryableStatus && attempt < maxRetries) {
				const retryAfter =
					response.status === 429 ? parseRetryAfter(response) : undefined;
				await new Promise((resolve) =>
					setTimeout(resolve, backoffDelayMs(attempt, retryAfter)),
				);
				continue;
			}
			return response;
		} catch (err) {
			if (attempt < maxRetries && !isTimeoutError(err)) {
				await new Promise((resolve) =>
					setTimeout(resolve, backoffDelayMs(attempt)),
				);
				continue;
			}
			throw err;
		}
	}
}

function rawHeaders(apiKey: string | null): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (apiKey) headers["X-API-Key"] = apiKey;
	return headers;
}

export async function anakinPost<T>(
	path: string,
	body: Record<string, unknown>,
	apiKey: string | null,
	timeoutMs = 120_000,
): Promise<{ status: number; body: T }> {
	const response = await fetchWithRetry(`${ANAKIN_BASE_URL}${path}`, {
		method: "POST",
		headers: rawHeaders(apiKey),
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	return { status: response.status, body: (await response.json()) as T };
}

export async function anakinGet<T>(
	path: string,
	params: Record<string, string> | undefined,
	apiKey: string | null,
	timeoutMs = 30_000,
): Promise<{ status: number; body: T }> {
	const url = new URL(`${ANAKIN_BASE_URL}${path}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	const response = await fetchWithRetry(url.toString(), {
		method: "GET",
		headers: rawHeaders(apiKey),
		signal: AbortSignal.timeout(timeoutMs),
	});
	return { status: response.status, body: (await response.json()) as T };
}

interface CountryEntry {
	code: string;
	name?: string;
}

let countriesCache: string[] | null = null;
let countriesFetchedAt = 0;
const COUNTRIES_TTL_MS = 24 * 60 * 60 * 1000;

export async function listCountries(apiKey: string | null): Promise<string[]> {
	if (countriesCache && Date.now() - countriesFetchedAt < COUNTRIES_TTL_MS) {
		return countriesCache;
	}
	try {
		const { body } = await anakinGet<{ countries?: CountryEntry[] }>(
			"/countries",
			undefined,
			apiKey,
		);
		if (Array.isArray(body.countries) && body.countries.length > 0) {
			countriesCache = body.countries.map((c) => c.code);
			countriesFetchedAt = Date.now();
			return countriesCache;
		}
	} catch {}
	countriesCache = [];
	countriesFetchedAt = Date.now();
	return countriesCache;
}

export async function isValidCountry(
	code: string,
	apiKey: string | null = null,
): Promise<boolean> {
	const list = await listCountries(apiKey);
	return list.includes(code.toLowerCase());
}
