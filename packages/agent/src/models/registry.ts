import { decryptSecret, type UserProvider } from "@aevryn/db";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { checkExternalUrl } from "../ssrf-guard";

export const ModelRegistry = {
	resolve(provider: UserProvider, modelId: string): LanguageModel {
		const urlVerdict = checkExternalUrl(provider.baseUrl);
		if (urlVerdict.blocked) {
			throw new Error(
				`Provider base URL is not reachable: ${urlVerdict.reason}`,
			);
		}

		const client = createOpenAICompatible({
			name: provider.slug,
			baseURL: provider.baseUrl,
			apiKey: decryptSecret(provider.apiKeyEncrypted),
		});

		return client.languageModel(modelId) as LanguageModel;
	},
} as const;
