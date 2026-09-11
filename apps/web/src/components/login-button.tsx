"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabaseClient } from "@/lib/supabase-client";

export function LoginButton() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	async function handleSignIn() {
		setLoading(true);
		const { error } = await supabaseClient.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
			},
		});
		if (error) {
			setLoading(false);
			console.error("Sign-in failed", error);
			router.refresh();
		}
	}

	return (
		<button
			type="button"
			onClick={handleSignIn}
			disabled={loading}
			className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-50"
		>
			{loading ? "Redirecting…" : "Continue with Google"}
		</button>
	);
}