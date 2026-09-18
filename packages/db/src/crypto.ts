import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

import { env } from "@aevryn/env/server";

const keyFor = (): Buffer =>
	createHash("sha256").update(env.VAULT_KEY, "utf8").digest();

export function encryptSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", keyFor(), iv);
	const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptSecret(cipherText: string): string {
	const [version, ivB64, tagB64, dataB64] = cipherText.split(":");
	if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
		throw new Error("Invalid ciphertext format");
	}
	const decipher = createDecipheriv(
		"aes-256-gcm",
		keyFor(),
		Buffer.from(ivB64, "base64"),
	);
	decipher.setAuthTag(Buffer.from(tagB64, "base64"));
	return Buffer.concat([
		decipher.update(Buffer.from(dataB64, "base64")),
		decipher.final(),
	]).toString("utf8");
}
