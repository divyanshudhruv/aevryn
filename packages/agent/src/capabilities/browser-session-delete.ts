import { z } from "zod";
import type { BrowserSessionAdapter } from "../adapters/browser-session";
import type { Capability } from "../capability";

const browserSessionDeleteInputSchema = z.object({
	sessionId: z.string().min(1),
});

export function createBrowserSessionDeleteCapability(
	adapter: BrowserSessionAdapter,
): Capability {
	return {
		name: "browserSessionDelete",
		description:
			"Delete an existing persistent browser session and its stored cookies. " +
			"Use when a session is no longer needed or its login must be cleared.",
		inputSchema: browserSessionDeleteInputSchema,
		requiresApproval: true,
		async execute(input) {
			const parsed = browserSessionDeleteInputSchema.safeParse(input);
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
				await adapter.delete(parsed.data.sessionId);
				return { ok: true, data: { deleted: parsed.data.sessionId } };
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
