import type {  Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

// Prefer an explicit public app URL; fall back to the Vercel production
// domain (injected automatically, no scheme); localhost last for dev.
const siteUrl =
	process.env.NEXT_PUBLIC_APP_URL ||
	(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
		? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
		: "http://localhost:3001");

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: {
		default: "Aevryn",
		template: "Aevryn · %s",
	},
	description:
		"Search, scrape, and research the live web with your own API key. See every step your agent takes.",
	openGraph: {
		images: ["/aevryn.png"],
	},
};

// Browser UI (address bar, task switcher) matches the page background.
export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${inter.variable} antialiased`}>
				{/* Logo mark + wordmark, both theme variants, so either theme's SVGs
            are already in cache the moment the Logo component mounts. */}
				<link rel="preload" href="/logo-black.svg" as="image" />
				<link rel="preload" href="/logo-white.svg" as="image" />
				<link rel="preload" href="/aevryn-black.svg" as="image" />
				<link rel="preload" href="/aevryn-white.svg" as="image" />
				<Providers>
					<div className="grid h-svh grid-rows-[auto_1fr]">{children}</div>
				</Providers>
				<Analytics />
			</body>
		</html>
	);
}
