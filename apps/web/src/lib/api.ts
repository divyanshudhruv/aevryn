// Shared JSON envelope for API responses. Every route returns the same
// { data, error, meta } shape so the client has a single unwrap path.

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/** Error response in the shared envelope. `code` is a stable machine
 *  identifier (e.g. "NO_BOUND_WORKFLOW"), `message` is human-readable. */
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