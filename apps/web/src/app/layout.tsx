import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
	display: "swap",
});

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
