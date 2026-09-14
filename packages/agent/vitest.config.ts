import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		env: {
			// Test fixtures — mirror packages/db/vitest.config.ts.
			VAULT_KEY:
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			DATABASE_URL: "postgresql://localhost:5432/test",
			NEXT_PUBLIC_SUPABASE_URL: "https://localhost.supabase.co",
			NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
			AGENT_MAX_STEPS: "12",
		},
	},
});
