import {
	db,
	DEFAULT_USER_SETTINGS,
	encryptSecret,
	userKeys,
	userProviders,
	userSettings,
	type Db,
	type ProviderModel,
	type UserProvider,
	type UserSettingsData,
} from "@aevryn/db";
import { and, eq } from "drizzle-orm";

export type ProviderSummary = Pick<
	UserProvider,
	"id" | "slug" | "displayName" | "baseUrl" | "models" | "createdAt"
>;

export type UserSettingsPatch = {
	notifications?: Partial<UserSettingsData["notifications"]>;
	defaultModel?: UserSettingsData["defaultModel"];
	memoryEnabled?: UserSettingsData["memoryEnabled"];
	defaultQuality?: UserSettingsData["defaultQuality"];
};

// ─── Settings ────────────────────────────────────────────────────────────────

/** Load the user's settings row, falling back to app defaults when absent. */
export class UserDataService {
	constructor(private readonly client: Db = db) {}

	// ─── Settings ──────────────────────────────────────────────────────────

	async getSettings(userId: string): Promise<UserSettingsData> {
		const [row] = await this.client
			.select({ settings: userSettings.settings })
			.from(userSettings)
			.where(eq(userSettings.userId, userId));
		return row?.settings ?? DEFAULT_USER_SETTINGS;
	}

	/** Merge partial settings over the stored ones and upsert the row. */
	async updateSettings(
		userId: string,
		patch: UserSettingsPatch,
	): Promise<UserSettingsData> {
		const current = await this.getSettings(userId);
		const merged: UserSettingsData = {
			notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
			defaultModel:
				patch.defaultModel !== undefined
					? patch.defaultModel
					: current.defaultModel,
			memoryEnabled:
				patch.memoryEnabled !== undefined
					? patch.memoryEnabled
					: (current.memoryEnabled ?? null),
			defaultQuality: patch.defaultQuality ?? current.defaultQuality,
		};

		await this.client
			.insert(userSettings)
			.values({ userId, settings: merged })
			.onConflictDoUpdate({
				target: userSettings.userId,
				set: { settings: merged, updatedAt: new Date() },
			});
		return merged;
	}

	// ─── API keys ──────────────────────────────────────────────────────────

	async listKeys(
		userId: string,
	): Promise<Array<{ name: string; updatedAt: Date }>> {
		return this.client
			.select({ name: userKeys.name, updatedAt: userKeys.updatedAt })
			.from(userKeys)
			.where(eq(userKeys.userId, userId));
	}

	/** Insert or rotate a user key. Value is plaintext here, encrypted here. */
	async upsertKey(
		userId: string,
		name: string,
		value: string,
	): Promise<{ name: string }> {
		const encrypted = encryptSecret(value);
		const [row] = await this.client
			.insert(userKeys)
			.values({ userId, name, encryptedValue: encrypted })
			.onConflictDoUpdate({
				target: [userKeys.userId, userKeys.name],
				set: { encryptedValue: encrypted, updatedAt: new Date() },
			})
			.returning({ name: userKeys.name });
		return row!;
	}

	async deleteKey(userId: string, name: string): Promise<void> {
		await this.client
			.delete(userKeys)
			.where(and(eq(userKeys.userId, userId), eq(userKeys.name, name)));
	}

	// ─── Provider endpoints ────────────────────────────────────────────────

	async listProviders(userId: string): Promise<ProviderSummary[]> {
		return this.client
			.select({
				id: userProviders.id,
				slug: userProviders.slug,
				displayName: userProviders.displayName,
				baseUrl: userProviders.baseUrl,
				models: userProviders.models,
				createdAt: userProviders.createdAt,
			})
			.from(userProviders)
			.where(eq(userProviders.userId, userId));
	}

	/** Full row (incl. encrypted key) for outbound calls like a test ping. */
	async getProvider(userId: string, slug: string): Promise<UserProvider | null> {
		const [row] = await this.client
			.select()
			.from(userProviders)
			.where(
				and(eq(userProviders.userId, userId), eq(userProviders.slug, slug)),
			);
		return row ?? null;
	}

	/**
	 * Upsert a provider endpoint. Re-saving a key (Keys tab) with no models
	 * must not wipe the stored model list, so empty payloads inherit it.
	 */
	async upsertProvider(input: {
		userId: string;
		slug: string;
		displayName: string;
		baseUrl: string;
		apiKey: string;
		models: ProviderModel[];
	}): Promise<{ id: string; slug: string }> {
		const models =
			input.models.length > 0
				? input.models
				: (await this.#getProviderModels(input.userId, input.slug)) ?? [];

		const encrypted = encryptSecret(input.apiKey);
		const [row] = await this.client
			.insert(userProviders)
			.values({
				userId: input.userId,
				slug: input.slug,
				displayName: input.displayName,
				baseUrl: input.baseUrl,
				apiKeyEncrypted: encrypted,
				models,
			})
			.onConflictDoUpdate({
				target: [userProviders.userId, userProviders.slug],
				set: {
					displayName: input.displayName,
					baseUrl: input.baseUrl,
					apiKeyEncrypted: encrypted,
					models,
					updatedAt: new Date(),
				},
			})
			.returning({ id: userProviders.id, slug: userProviders.slug });
		return row!;
	}

	/**
	 * Replace a provider's model list wholesale, or append a single model.
	 * Throws `PROVIDER_NOT_FOUND` when the provider row is missing and
	 * `MODEL_EXISTS` when the appended id already exists.
	 */
	async updateProviderModels(
		userId: string,
		slug: string,
		input: { modelId?: string; displayName?: string; models?: ProviderModel[] },
	): Promise<{ id: string; slug: string }> {
		const existingModels = await this.#getProviderModels(userId, slug);
		if (!existingModels) {
			throw Object.assign(new Error(`Provider ${slug} not found`), {
				code: "PROVIDER_NOT_FOUND",
			});
		}

		let models = existingModels;
		if (input.models) {
			models = input.models;
		} else if (input.modelId) {
			if (existingModels.some((m) => m.id === input.modelId)) {
				throw Object.assign(
					new Error(`Model '${input.modelId}' already exists on this provider`),
					{ code: "MODEL_EXISTS", modelId: input.modelId },
				);
			}
			models = [
				...existingModels,
				{
					id: input.modelId,
					...(input.displayName ? { displayName: input.displayName } : {}),
				},
			];
		}

		const [row] = await this.client
			.update(userProviders)
			.set({ models, updatedAt: new Date() })
			.where(
				and(eq(userProviders.userId, userId), eq(userProviders.slug, slug)),
			)
			.returning({ id: userProviders.id, slug: userProviders.slug });
		return row!;
	}

	async deleteProvider(userId: string, slug: string): Promise<void> {
		await this.client
			.delete(userProviders)
			.where(
				and(eq(userProviders.userId, userId), eq(userProviders.slug, slug)),
			);
	}

	async #getProviderModels(
		userId: string,
		slug: string,
	): Promise<ProviderModel[] | null> {
		const [existing] = await this.client
			.select({ models: userProviders.models })
			.from(userProviders)
			.where(
				and(eq(userProviders.userId, userId), eq(userProviders.slug, slug)),
			)
			.limit(1);
		return existing ? existing.models : null;
	}
}