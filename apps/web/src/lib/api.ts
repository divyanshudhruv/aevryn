const NO_STORE_HEADERS = { "cache-control": "no-store" };

export function jsonError(
	status: number,
	code: string,
	message: string,
): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: NO_STORE_HEADERS },
	);
}
