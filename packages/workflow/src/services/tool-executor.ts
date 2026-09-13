import type { Db } from "@aevryn/db";
import { db } from "@aevryn/db";
import { KeyService } from "./key-service";

/**
 * Tool execution wrapper — THE single place a capability is executed.
 * Resolves the API key for the provider, invokes the executor, and
 * normalizes the outcome into one stable shape for both activity recording
 * and agent reasoning. Both the chat HTTP path and the durable runner call
 * this; neither builds its own pipeline.
 */

export type ToolOutcome<T = unknown> =
	| { ok: true; output: T; keySource: string }
	| { ok: false; error: string; keySource: string | null };

export interface ExecuteToolInput<T = unknown> {
	/** Capability name, e.g. "anakin.web_action" — used for traces. */
	name: string;
	/** Which provider vault/env key the executor needs. */
	provider: "groq" | "anakin" | "mem0";
	workspaceId: string;
	userId: string;
	/** The actual execution. Receives the resolved API key. */
	run: (ctx: { apiKey: string }) => Promise<T>;
}

export class ToolExecutor {
	private readonly keys: KeyService;

	constructor(
		client: Db = db,
		keys?: KeyService,
	) {
		this.keys = keys ?? new KeyService(client);
	}

	async execute<T>(input: ExecuteToolInput<T>): Promise<ToolOutcome<T>> {
		const resolved = await this.keys.resolveKey(
			input.workspaceId,
			input.userId,
			input.provider,
		);
		if (!resolved.key) {
			return {
				ok: false,
				error: `${input.name}: no API key configured for provider "${input.provider}"`,
				keySource: null,
			};
		}
		try {
			const output = await input.run({ apiKey: resolved.key });
			return { ok: true, output, keySource: resolved.source };
		} catch (error) {
			return {
				ok: false,
				error: `${input.name} failed: ${(error as Error).message}`,
				keySource: resolved.source,
			};
		}
	}
}

export const toolExecutor = new ToolExecutor();
