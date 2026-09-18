import { Button } from "@aevryn/ui/components/ui/button";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = {
	title: {
		absolute: "Aevryn · 404 Page not found",
	},
};

export default function NotFound() {
	return (
		<div className="flex min-h-svh flex-col justify-between gap-4">
			<div />
			<div className="flex items-center justify-center px-4">
				<div className="flex w-full max-w-sm flex-col gap-6">
					<Logo size="md" className="justify-start" />
					<div className="flex flex-col justify-start gap-2 text-left">
						<h1 className="font-normal text-2xl text-foreground leading-tight">
							404 - Page not found
						</h1>
						<p className="text-muted-foreground text-sm leading-1">
							This page doesn&apos;t exist or has been moved.
						</p>
					</div>
					<Button asChild className="w-full gap-2">
						<Link href="/">Go back home</Link>
					</Button>
				</div>
			</div>
			<footer className="flex items-center justify-center gap-1 py-4 text-xs">
				<a
					href="/terms"
					className="text-muted-foreground text-xs underline underline-offset-4"
				>
					Terms of Service{" "}
				</a>{" "}
				and{" "}
				<a
					href="/privacy"
					className="text-muted-foreground text-xs underline underline-offset-4"
				>
					Privacy Policy
				</a>
			</footer>
		</div>
	);
}