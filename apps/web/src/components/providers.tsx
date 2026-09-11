"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { SizeProvider } from "@aevryn/ui/lib/size-context";

import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

const SCRIPT_TAG_WARNING =
	"Encountered a script tag while rendering React component";

export default function Providers({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const prev = console.error.bind(console);
		console.error = (...args: unknown[]) => {
			if (
				typeof args[0] === "string" &&
				args[0].includes(SCRIPT_TAG_WARNING)
			) {
				return;
			}
			prev(...args);
		};
		return () => {
			console.error = prev;
		};
	}, []);

	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<SizeProvider>
				<QueryClientProvider client={queryClient}>
					{children}
					<ReactQueryDevtools />
				</QueryClientProvider>
			</SizeProvider>
		</ThemeProvider>
	);
}
