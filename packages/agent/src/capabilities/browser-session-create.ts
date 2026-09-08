import { z } from "zod";
import type { BrowserSessionAdapter } from "../adapters/browser-session";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const browserSessionCreateInputSchema = z.object({
	websiteUrl: z.string().url(),
	name: z.string().min(1),
	record: z.boolean().optional(),
	sessionType: z.string().optional(),
});

export function createBrowserSessionCreateCapability(
	adapter: BrowserSessionAdapter,
): Capability {
	return {
		name: "browserSessionCreate",
		description:
			"Create a new persistent browser session for a website so it can be used " +
			"for authenticated scraping. The user completes the login flow in the " +
			"returned live browser view. Consequential: creates a stored session.",
		inputSchema: browserSessionCreateInputSchema,
		requiresApproval: true,
		async execute(input) {
			const parsed = browserSessionCreateInputSchema.safeParse(input);
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
				const result = await adapter.create({
					websiteUrl: parsed.data.websiteUrl,
					name: parsed.data.name,
					record: parsed.data.record,
					sessionType: parsed.data.sessionType,
				});
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
