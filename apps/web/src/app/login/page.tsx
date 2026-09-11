import { Suspense } from "react";

import { LoginButton } from "@/components/login-button";

export default function LoginPage() {
	return (
		<main className="container mx-auto flex h-full max-w-md flex-col items-center justify-center gap-6 px-4">
			<div className="text-center">
				<h1 className="text-2xl font-semibold">Sign in to Aevryn</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Google-only login. Your workspace is created automatically on
					first sign-in.
				</p>
			</div>
			<Suspense>
				<LoginButton />
			</Suspense>
		</main>
	);
}