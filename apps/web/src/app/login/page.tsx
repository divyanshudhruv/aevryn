"use client";

import { createBrowserSupabase } from "@aevryn/auth";
import { Button } from "@aevryn/ui/components/ui/button";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
	const router = useRouter();
	const params = useSearchParams();
	const next = params.get("next") ?? "/workspace";
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [mode, setMode] = useState<"in" | "up">("in");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		const sb = createBrowserSupabase();
		if (mode === "in") {
			const { error } = await sb.auth.signInWithPassword({
				email,
				password,
			});
			if (error) setError(error.message);
			else router.push(next as Route);
		} else {
			const { data, error } = await sb.auth.signUp({
				email,
				password,
				options: { data: { name: name || email } },
			});
			if (error) setError(error.message);
			else if (!data.session) {
				// Email confirmation enabled — ask user to check inbox.
				setError("Check your email to confirm your account.");
			} else router.push(next as Route);
		}
		setBusy(false);
	};

	return (
		<main className="flex min-h-dvh items-center justify-center p-6">
			<form
				onSubmit={submit}
				className="w-full max-w-sm space-y-4 rounded-2xl border p-6"
			>
				<h1 className="font-semibold text-lg">
					{mode === "in" ? "Sign in" : "Create account"}
				</h1>
				{mode === "up" && (
					<input
						className="w-full rounded-lg border px-3 py-2 text-sm"
						placeholder="Name (optional)"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				)}
				<input
					type="email"
					required
					className="w-full rounded-lg border px-3 py-2 text-sm"
					placeholder="you@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<input
					type="password"
					required
					className="w-full rounded-lg border px-3 py-2 text-sm"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				{error && <p className="text-destructive text-sm">{error}</p>}
				<Button type="submit" className="w-full" disabled={busy}>
					{mode === "in" ? "Sign in" : "Sign up"}
				</Button>
				<button
					type="button"
					className="w-full text-center text-muted-foreground text-sm"
					onClick={() => setMode((m) => (m === "in" ? "up" : "in"))}
				>
					{mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
				</button>
			</form>
		</main>
	);
}

export default function LoginPage() {
	return (
		<Suspense>
			<LoginForm />
		</Suspense>
	);
}
