import { z } from "zod";
import type { BrowserSessionAdapter } from "../adapters/browser-session";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const browserSessionListInputSchema = z.object({
	domain: z.string().optional(),
});

export function createBrowserSessionListCapability(
	adapter: BrowserSessionAdapter,
): Capability {
	return {
		name: "browserSessionList",
		description:
			"List existing persistent browser sessions. Sessions hold cookies and " +
			"storage for scraping behind logins on specific sites.",
		inputSchema: browserSessionListInputSchema,
		async execute(input) {
			const parsed = browserSessionListInputSchema.safeParse(input);
			if (!parsed.success) {
				return {
					ok: false,
					error: {
						code: "INVALID_CAPABILITY_INPUT",
						message: parsed.error.message,
						failureClass: "fatal",
						retryable: false,
					},
				};
			}
			const startedAt = performance.now();
			try {
				const result = await adapter.list({ domain: parsed.data.domain });
				return {
					ok: true,
					data: result,
					provider: {
						id: adapter.name,
						durationMs: performance.now() - startedAt,
					},
				};
			} catch (error) {
				return toCapabilityFailure(error, performance.now() - startedAt);
			}
		},
	};
}
