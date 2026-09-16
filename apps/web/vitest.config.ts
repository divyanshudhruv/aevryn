import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		env: {
			NEXT_PUBLIC_SUPABASE_URL: "https://localhost.supabase.co",
			NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
		},
	},
});