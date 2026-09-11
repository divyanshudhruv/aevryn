import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import {
	type ApiProvider,
	type Db,
	db,
	ids,
	userProfiles,
	type WorkspaceApiKey,
	workspaceApiKeys,
} from "@aevryn/db";
import { env } from "@aevryn/env/server";
import { and, eq } from "drizzle-orm";

/**
 * Per-workspace API-key vault. Keys are encrypted at rest with AES-256-GCM
 * and decrypted only on demand. Resolution order for a run is:
 *   1. user preference (member-override): user opted into their own keys
 *      in shared threads → env key
 *   2. workspace key for the provider (decrypted from the vault)
 *   3. env fallback (global env var)
 */
export class KeyService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	private masterKey(): Buffer {
		const secret = env.VAULT_KEY || env.SUPABASE_AUTH_SECRET;
		if (!secret) {
			throw new Error(
				"VAULT_KEY (or SUPABASE_AUTH_SECRET) is required to encrypt workspace API keys",
			);
		}
		return createHash("sha256").update(secret).digest();
	}

	async setProviderKey(input: {
		workspaceId: string;
		createdBy: string;
		provider: ApiProvider;
		apiKey: string;
		modelName?: string;
	}): Promise<WorkspaceApiKey> {
		const encrypted = encrypt(this.masterKey(), input.apiKey);
		const [row] = await this.scope()
			.insert(workspaceApiKeys)
			.values({
				id: ids.workspaceApiKey(),
				workspaceId: input.workspaceId,
				createdBy: input.createdBy,
				provider: input.provider,
				keyEncrypted: encrypted,
				modelName: input.modelName ?? null,
			})
			.onConflictDoUpdate({
				target: [workspaceApiKeys.workspaceId, workspaceApiKeys.provider],
				set: {
					keyEncrypted: encrypted,
					modelName: input.modelName ?? null,
					updatedAt: new Date(),
				},
			})
			.returning();
		return row!;
	}

	async getWorkspaceKey(
		workspaceId: string,
		provider: ApiProvider,
	): Promise<{ apiKey: string; modelName?: string | null } | undefined> {
		const row = await this.scope().query.workspaceApiKeys.findFirst({
			where: and(
				eq(workspaceApiKeys.workspaceId, workspaceId),
				eq(workspaceApiKeys.provider, provider),
			),
		});
		if (!row) {
			return undefined;
		}
		try {
			return {
				apiKey: decrypt(this.masterKey(), row.keyEncrypted),
				modelName: row.modelName,
			};
		} catch (error) {
			throw new Error(
				`workspace_key.${provider} failed to decrypt: ${(error as Error).message}`,
			);
		}
	}

	async listWorkspaceKeys(
		workspaceId: string,
	): Promise<
		Array<Pick<WorkspaceApiKey, "id" | "provider" | "modelName" | "createdAt">>
	> {
		const rows = await this.scope().query.workspaceApiKeys.findMany({
			where: eq(workspaceApiKeys.workspaceId, workspaceId),
		});
		return rows.map(({ id, provider, modelName, createdAt }) => ({
			id,
			provider,
			modelName,
			createdAt,
		}));
	}

	async deleteProviderKey(
		workspaceId: string,
		provider: ApiProvider,
	): Promise<void> {
		await this.scope()
			.delete(workspaceApiKeys)
			.where(
				and(
					eq(workspaceApiKeys.workspaceId, workspaceId),
					eq(workspaceApiKeys.provider, provider),
				),
			);
	}

	/**
	 * Resolve the effective key for a provider: user override → workspace
	 * vault → env. Never throws for a missing key; returns `{ key: null }`.
	 */
	async resolveKey(
		workspaceId: string,
		userId: string,
		provider: ApiProvider,
	): Promise<
		| { key: string; source: "override" | "workspace" | "env" }
		| { key: null; source: "none" }
	> {
		const profile = await this.scope().query.userProfiles.findFirst({
			where: eq(userProfiles.userId, userId),
		});
		if (profile?.preferOwnKeysInShared) {
			const envKey = envKeyFor(provider);
			if (envKey) {
				return { key: envKey, source: "override" };
			}
		}
		const workspaceKey = await this.getWorkspaceKey(workspaceId, provider);
		if (workspaceKey) {
			return { key: workspaceKey.apiKey, source: "workspace" };
		}
		const envKey = envKeyFor(provider);
		if (envKey) {
			return { key: envKey, source: "env" };
		}
		return { key: null, source: "none" };
	}
}

function envKeyFor(provider: ApiProvider): string | undefined {
	switch (provider) {
		case "groq":
			return env.GROQ_API_KEY;
		case "anakin":
			return env.ANAKIN_API_KEY;
		case "mem0":
			return env.MEM0_API_KEY;
		default:
			return undefined;
	}
}

function encrypt(masterKey: Buffer, plaintext: string): Buffer {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(masterKey: Buffer, payload: Buffer): string {
	const iv = payload.subarray(0, 12);
	const tag = payload.subarray(12, 28);
	const data = payload.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString(
		"utf8",
	);
}
