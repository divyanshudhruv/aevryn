import { Suspense } from "react";

import { LoginScreen } from "@/components/login-screen";

export const metadata = {
	title: "Sign in — Aevryn",
};

export default function LoginPage() {
	return (
		<main className="container mx-auto flex h-full max-w-md items-center justify-center px-4">
			<Suspense>
				<LoginScreen />
			</Suspense>
		</main>
	);
}