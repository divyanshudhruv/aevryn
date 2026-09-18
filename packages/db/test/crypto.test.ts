import { beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "../src/crypto";

const TEST_KEY =
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("CryptoBox", () => {
	beforeEach(() => {
		process.env.VAULT_KEY = TEST_KEY;
	});

	it("round-trips a secret", () => {
		const cipher = encryptSecret("ak-live-abc123");
		expect(cipher).not.toContain("ak-live");
		expect(cipher.startsWith("v1:")).toBe(true);
		expect(decryptSecret(cipher)).toBe("ak-live-abc123");
	});

	it("produces unique ciphertexts (random IV)", () => {
		expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
	});

	it("throws on tampered ciphertext", () => {
		const cipher = encryptSecret("secret");
		// Flip a character inside the data segment (after the 3rd colon) so the
		// base64 stays parseable but the GCM tag no longer matches.
		const parts = cipher.split(":");
		const data = parts[3];
		if (data == null) throw new Error("unexpected ciphertext shape");
		const swapped = `${data.slice(0, -2)}${data.at(-1) === "A" ? "B" : "A"}`;
		expect(() =>
			decryptSecret([parts[0], parts[1], parts[2], swapped].join(":")),
		).toThrow();
	});

	it("rejects malformed ciphertext", () => {
		expect(() => decryptSecret("not-a-cipher")).toThrow();
	});
});
