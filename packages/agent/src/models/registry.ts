import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { decryptSecret, type UserProvider } from "@aevryn/db";

import type { LanguageModel } from "ai";

export const ModelRegistry = {
		resolve(provider: UserProvider, modelId: string): LanguageModel {
		const client = createOpenAICompatible({
			name: provider.slug,
			baseURL: provider.baseUrl,
			apiKey: decryptSecret(provider.apiKeyEncrypted),
		});

		return client.languageModel(modelId) as LanguageModel;
	},
} as const;
