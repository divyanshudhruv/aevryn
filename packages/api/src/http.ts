import { NextResponse } from "next/server";

export type ApiErrorName =
	| "BAD_REQUEST"
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "CONFLICT"
	| "TOO_MANY_REQUESTS"
	| "INTERNAL_SERVER_ERROR";

export const STATUS_BY_ERROR: Record<ApiErrorName, number> = {
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
	return NextResponse.json(data, init);
}

export function okJson<T>(
	data: T,
	status = 200,
	extra: Record<string, string> = {},
): NextResponse<T> {
	return NextResponse.json(data, {
		status,
		headers: {
			"cache-control": "no-store",
			...extra,
		},
	});
}

export function fail(
	name: ApiErrorName,
	message: string,
	extra: { code?: string; field?: string } = {},
): NextResponse<{
	error: { name: ApiErrorName; message: string; code: string; field?: string };
}> {
	return NextResponse.json(
		{
			error: {
				name,
				message,
				code: extra.code ?? name,
				field: extra.field,
			},
		},
		{
			status: STATUS_BY_ERROR[name],
			headers: { "cache-control": "no-store" },
		},
	);
}

export function item<T>(data: T): { data: T } {
	return { data };
}

export function list<T>(data: T[]): { data: T[]; count: number } {
	return { data, count: data.length };
}

export class ApiError extends Error {
	constructor(
		public readonly name: ApiErrorName,
		message: string,
		public readonly code?: string,
		public readonly field?: string,
		cause?: unknown,
	) {
		super(message, { cause });
	}
}