import { z } from "zod";
import type { BrowserSessionAdapter } from "../adapters/browser-session";
import type { Capability } from "../capability";

const browserSessionCreateInputSchema = z.object({
	websiteUrl: z.string().url(),
	name: z.string().min(1),
	record: z.boolean().optional(),
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
					},
				};
			}
			try {
				const result = await adapter.create({
					websiteUrl: parsed.data.websiteUrl,
					name: parsed.data.name,
					record: parsed.data.record,
				});
				return { ok: true, data: result };
			} catch (error) {
				return {
					ok: false,
					error: {
						code: "CAPABILITY_EXECUTION_FAILED",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				};
			}
		},
	};
}
