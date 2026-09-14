import {
	Anakin,
	AnakinError,
	InsufficientCreditsError,
	RateLimitError,
	WireAuthRequiredError,
} from "@anakin-io/sdk";

export interface ToolError {
	ok: false;
	error: {
		code: string;
		message: string;
				signupUrl?: string;
				connectUrl?: string;
				balance?: number;
		required?: number;
				retryAfterSeconds?: number;
	};
}

export type ToolResult<T> =
	| ({ ok: true } & T)
	| ToolError;

export const ANAKIN_BASE_URL = "https://api.anakin.io/v1";

export function anakinClient(apiKey: string): Anakin {
	return new Anakin({
		apiKey,
		// Per-tool polling cadence is passed per call where it matters;
		// these are safe defaults (research overrides to 10s/10min).
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

	// Zero-Touch graceful 402 (per-IP allowance exhausted).
	if (
		err instanceof AnakinError &&
		err.statusCode === 402
	) {
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

	if (err instanceof AnakinError) {
		return {
			ok: false,
			error: {
				code: err.code ?? `ANAKIN_${err.statusCode ?? "ERROR"}`,
				message: err.message,
			},
		};
	}

	return {
		ok: false,
		error: {
			code: "TOOL_FAILED",
			message: err instanceof Error ? err.message : String(err),
		},
	};
}

// ─── Raw HTTP helpers (endpoints the SDK doesn't cover yet) ─────────────────

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
	const response = await fetch(`${ANAKIN_BASE_URL}${path}`, {
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
): Promise<{ status: number; body: T }> {
	const url = new URL(`${ANAKIN_BASE_URL}${path}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	const response = await fetch(url.toString(), {
		method: "GET",
		headers: rawHeaders(apiKey),
	});
	return { status: response.status, body: (await response.json()) as T };
}

// ─── Country list (live, cached, fail-open) ─────────────────────────────────

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
	} catch {
		// fail-open
	}
	countriesCache = [];
	countriesFetchedAt = Date.now();
	return countriesCache;
}

export async function isValidCountry(code: string): Promise<boolean> {
	const list = await listCountries(null);
	if (list.length === 0) return true; // fail-open
	return list.includes(code.toLowerCase());
}
