import { createHash, randomBytes } from "node:crypto";
import { env } from "@aevryn/env/server";
import {
	db,
	ids,
	webhookHooks,
	type Db,
	type WebhookHook,
} from "@aevryn/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const webhookFireSchema = z.unknown().refine((value) => value !== undefined, {
	message: "Request body must not be empty",
});

export interface MintWebhookInput {
	runId: string;
	workspaceId: string;
	threadId: string;
	userId: string;
	instruction: string;
	expiresInSeconds?: number;
	reason?: string;
}

export interface ConsumeWebhookInput {
	token: string;
	payload: unknown;
}

export interface ConsumeResult {
	ok: boolean;
	reason?: "not-found" | "expired" | "already-fired" | "unavailable";
	hook?: WebhookHook;
}

/**
 * Durable wait/resume tokens — the blessed home for the `wait` decision
 * (`whk_` ULID, SCHEMA.md §19). The plaintext token is handed to the user,
 * never persisted; only its SHA-256 hash is stored (unauthenticated route
 * auths through the token alone). One run may mint several hooks.
 */
export class WebhookHookService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	/**
	 * Mint a hook and flip the run to `waiting`. Returns the raw token + the
	 * public URL to hand back to the model, which the user POSTs to when the
	 * external event happens.
	 */
	async mint(input: MintWebhookInput): Promise<{ token: string; url: string }> {
		const token = randomBytes(24).toString("base64url");
		const tokenHash = createHash("sha256").update(token).digest("hex");
		const expiresAt = input.expiresInSeconds
			? new Date(Date.now() + input.expiresInSeconds * 1000)
			: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		await this.scope().insert(webhookHooks).values({
			id: ids.webhookHook(),
			runId: input.runId,
			workspaceId: input.workspaceId,
			threadId: input.threadId,
			userId: input.userId,
			tokenHash,
			status: "active",
			expiresAt,
			consumePayload: { instruction: input.instruction } as never,
		});
		return {
			token,
			url: `${env.WEBHOOK_BASE_URL}/api/v1/hooks/${token}`,
		};
	}

	/**
	 * Consume a webhook by its plaintext token. Marks the hook fired and
	 * stores the payload; the caller resets the run and fires a resume pass.
	 */
	async consume(input: ConsumeWebhookInput): Promise<ConsumeResult> {
		const tokenHash = createHash("sha256").update(input.token).digest("hex");
		const hook = await this.scope().query.webhookHooks.findFirst({
			where: eq(webhookHooks.tokenHash, tokenHash),
		});
		if (!hook) {
			return { ok: false, reason: "not-found" };
		}
		if (hook.status !== "active") {
			return { ok: false, reason: "already-fired" };
		}
		if (hook.expiresAt.getTime() < Date.now()) {
			await this.scope()
				.update(webhookHooks)
				.set({ status: "expired" })
				.where(eq(webhookHooks.id, hook.id));
			return { ok: false, reason: "expired" };
		}
		await this.scope()
			.update(webhookHooks)
			.set({
				status: "fired",
				firedAt: new Date(),
				consumePayload: {
					instruction:
						(hook.consumePayload as { instruction?: unknown } | null)
							?.instruction ?? "",
					payload: input.payload,
				} as never,
			})
			.where(eq(webhookHooks.id, hook.id));
		return {
			ok: true,
			hook: { ...hook, status: "fired" },
		};
	}
}