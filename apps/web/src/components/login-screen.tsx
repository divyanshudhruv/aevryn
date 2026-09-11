"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabaseClient } from "@/lib/supabase-client";

export function LoginScreen() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSignIn() {
		setLoading(true);
		setError(null);
		const { error } = await supabaseClient.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
			},
		});
		if (error) {
			setLoading(false);
			setError("Couldn't start sign-in. Try again.");
		}
	}

	return (
		<div className="flex flex-col items-center gap-6 text-center">
			<div>
				<h1 className="text-2xl font-semibold">Sign in to Aevryn</h1>
				<p className="mt-2 max-w-sm text-sm text-muted-foreground">
					Google-only login. Your personal workspace is created automatically
					on first sign-in.
				</p>
			</div>
			<button
				type="button"
				onClick={handleSignIn}
				disabled={loading}
				className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-50"
			>
				{loading ? "Redirecting…" : "Continue with Google"}
			</button>
			{error && (
				<p className="text-sm text-red-500" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}