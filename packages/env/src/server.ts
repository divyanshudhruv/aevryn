import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const runtimeEnv = {
	...process.env,
};

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
		NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
		/**
		 * Required: derives the AES-256-GCM key that encrypts user-supplied
		 * secrets (model-provider keys, Anakin key, Mem0 key) at rest.
		 * Rotating this forces users to re-enter their keys.
		 */
		VAULT_KEY: z.string().min(32),
		/**
		 * Required: standalone HMAC secret that binds tool-approval responses
		 * to the server (AI SDK `experimental_toolApprovalSecret`). Kept
		 * separate from VAULT_KEY so rotating either credential never
		 * invalidates the other. MUST be >= 32 chars.
		 */
		APPROVAL_SECRET: z.string().min(32),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		AGENT_MAX_STEPS: z.coerce.number().int().positive().default(12),
	},
	runtimeEnv: runtimeEnv,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
