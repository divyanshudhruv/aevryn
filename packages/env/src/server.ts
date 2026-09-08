import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function getVercelOrigin() {
	const vercelUrl =
		process.env.VERCEL_ENV === "production"
			? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
			: (process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL);
	if (!vercelUrl) return undefined;
	return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
}

const vercelOrigin = getVercelOrigin();

const runtimeEnv = {
	...process.env,
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? vercelOrigin,
};

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		ANAKIN_API_KEY: z.string().min(1).optional(),
		ANAKIN_BASE_URL: z.url().optional(),
		INNGEST_EVENT_KEY: z.string().min(1).optional(),
		INNGEST_SIGNING_KEY: z.string().min(1).optional(),
		INNGEST_APP_ID: z.string().min(1).optional(),
		GROQ_API_KEY: z.string().min(1).optional(),
		GROQ_MODEL: z.string().min(1).default("qwen/qwen3.8-27b"),
	},
	runtimeEnv: runtimeEnv,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
