import { z } from "zod";
import type { BrowserSessionAdapter } from "../adapters/browser-session";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const browserSessionRenameInputSchema = z.object({
	sessionId: z.string().min(1),
	name: z.string().min(1),
});

export function createBrowserSessionRenameCapability(
	adapter: BrowserSessionAdapter,
): Capability {
	return {
		name: "browserSessionRename",
		description:
			"Rename an existing persistent browser session. Use when a session's " +
			"current name no longer describes its purpose.",
		inputSchema: browserSessionRenameInputSchema,
		requiresApproval: true,
		async execute(input) {
			const parsed = browserSessionRenameInputSchema.safeParse(input);
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
				const result = await adapter.update(parsed.data.sessionId, {
					name: parsed.data.name,
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
