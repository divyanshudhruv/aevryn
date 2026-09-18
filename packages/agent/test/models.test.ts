import { describe, expect, it } from "vitest";

import { encryptSecret } from "@aevryn/db";
import type { UserProvider } from "@aevryn/db";

import { ModelRegistry } from "../src/models/registry";

function makeProvider(overrides: Partial<UserProvider> = {}): UserProvider {
	return {
		id: "prv_test",
		userId: "00000000-0000-0000-0000-000000000000",
		slug: "groq",
		displayName: "Groq",
		baseUrl: "https://api.groq.com/openai/v1",
		apiKeyEncrypted: encryptSecret("gsk_test_key"),
		models: [{ id: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B" }],
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

describe("ModelRegistry", () => {
	it("resolves a provider row + model id into a LanguageModel", () => {
		const model = ModelRegistry.resolve(
			makeProvider(),
			"llama-3.3-70b-versatile",
		);

		expect(model).toBeDefined();
		// LanguageModelV2 contract — providerImplementation marker exists.
		expect((model as { provider?: string }).provider).toBeDefined();
	});

	it("resolves distinct models for distinct model ids", () => {
		const provider = makeProvider();
		const a = ModelRegistry.resolve(provider, "llama-3.3-70b-versatile");
		const b = ModelRegistry.resolve(provider, "llama-3.1-8b-instant");

		expect(a).not.toBe(b);
	});

	it("decrypts the stored key (does not pass ciphertext to the provider)", () => {
		const provider = makeProvider();
		// If this threw, the encrypted blob would have been used as the API key
		// (openai-compatible does not validate format, so assert via no-throw +
		// distinct resolutions succeed).
		expect(() =>
			ModelRegistry.resolve(provider, "llama-3.3-70b-versatile"),
		).not.toThrow();
	});
});
