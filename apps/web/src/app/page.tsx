"use client";

import { createBrowserSupabase } from "@aevryn/auth";
import { Button } from "@aevryn/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

const inputClass =
	"h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring";

export default function Home() {
	const router = useRouter();
	const healthCheck = useQuery(trpc.healthCheck.queryOptions());

	const [mode, setMode] = useState<"signin" | "signup">("signin");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitError, setSubmitError] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let active = true;
		const supabase = createBrowserSupabase();
		supabase.auth.getSession().then(({ data }) => {
			if (active && data.session) router.replace("/workspace");
		});
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			if (active && session) router.replace("/workspace");
		});
		return () => {
			active = false;
			subscription.unsubscribe();
		};
	}, [router]);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitError("");
		setLoading(true);
		try {
			const supabase = createBrowserSupabase();
			const res =
				mode === "signin"
					? await supabase.auth.signInWithPassword({ email, password })
					: await supabase.auth.signUp({
							email,
							password,
							options: { data: { name: name || email } },
						});

			if (res.error) {
				setSubmitError(res.error.message ?? "Something went wrong");
			} else {
				toast.success(mode === "signin" ? "Welcome back" : "Account created");
				router.replace("/workspace");
				router.refresh();
			}
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-2">
			<pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>

			<section className="rounded-lg border p-6">
				<h2 className="mb-4 font-medium">
					{mode === "signin" ? "Sign in" : "Create account"}
				</h2>
				<form className="flex flex-col gap-3" onSubmit={onSubmit}>
					{mode === "signup" && (
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-muted-foreground">Name</span>
							<input
								className={inputClass}
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Ada Lovelace"
								required
							/>
						</label>
					)}
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">Email</span>
						<input
							className={inputClass}
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							required
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">Password</span>
						<input
							className={inputClass}
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder={mode === "signin" ? "••••••••" : "Min 8 characters"}
							minLength={mode === "signup" ? 8 : undefined}
							required
						/>
					</label>
					{submitError && (
						<p className="text-destructive text-sm">{submitError}</p>
					)}
					<Button type="submit" disabled={loading}>
						{loading
							? "Please wait…"
							: mode === "signin"
								? "Sign in"
								: "Create account"}
					</Button>
					<button
						type="button"
						className="w-fit text-muted-foreground text-sm hover:text-foreground"
						onClick={() =>
							setMode((m) => (m === "signin" ? "signup" : "signin"))
						}
					>
						{mode === "signin"
							? "No account? Create one"
							: "Already have an account? Sign in"}
					</button>
				</form>
			</section>

			<section className="rounded-lg border p-4">
				<h2 className="mb-2 font-medium">API Status</h2>
				<div className="flex items-center gap-2">
					<div
						className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
					/>
					<span className="text-muted-foreground text-sm">
						{healthCheck.isLoading
							? "Checking..."
							: healthCheck.data
								? "Connected"
								: "Disconnected"}
					</span>
				</div>
			</section>
		</div>
	);
}
