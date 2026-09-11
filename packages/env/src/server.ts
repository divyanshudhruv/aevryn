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
		SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
		SUPABASE_AUTH_SECRET: z.string().min(1).optional(),
		VAULT_KEY: z.string().min(1).optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		ANAKIN_API_KEY: z.string().min(1).optional(),
		ANAKIN_BASE_URL: z.url().optional(),
		INNGEST_EVENT_KEY: z.string().min(1).optional(),
		INNGEST_SIGNING_KEY: z.string().min(1).optional(),
		INNGEST_APP_ID: z.string().min(1).optional(),
		GROQ_API_KEY: z.string().min(1).optional(),
		GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
		MEM0_API_KEY: z.string().min(1).default(""),
		AGENT_MAX_STEPS: z.coerce.number().int().positive().default(5),
		AGENT_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(50),
		EXECUTION_MAX_SECONDS: z.coerce.number().int().positive().default(900),
		EXECUTION_MAX_COST_USD: z.coerce.number().nonnegative().default(1),
		EXECUTION_MAX_SLEEP_SECONDS: z.coerce
			.number()
			.int()
			.positive()
			.default(604800),
		RECOVERY_MAX_ATTEMPTS: z.coerce.number().int().min(0).default(2),
		WEBHOOK_BASE_URL: z.string().url().default("http://localhost:3000"),
	},
	runtimeEnv: runtimeEnv,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
