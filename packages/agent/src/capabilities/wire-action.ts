import { z } from "zod";
import type { WireAdapter } from "../adapters/wire";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const wireActionInputSchema = z.object({
	actionId: z
		.string()
		.min(1)
		.describe("Platform action id, e.g. platform/action like linkedin/post"),
	params: z.record(z.string(), z.unknown()).default({}),
});

export function createWireActionCapability(adapter: WireAdapter): Capability {
	return {
		name: "wireAction",
		description:
			"Execute a read or write action against one of 940+ external services " +
			"(LinkedIn, Amazon, TikTok, Gmail, etc.) through the Wire API. The actionId " +
			"names the platform and action. WRITE actions are consequential and " +
			"must be presented to the user for approval before execution.",
		inputSchema: wireActionInputSchema,
		requiresApproval: true,
		async execute(input) {
			const parsed = wireActionInputSchema.safeParse(input);
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
				const result = await adapter.wire(
					parsed.data.actionId,
					parsed.data.params,
				);
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
