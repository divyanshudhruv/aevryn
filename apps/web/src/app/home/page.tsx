import { CardSection } from "@aevryn/ui/components/card-section";
import { Button } from "@aevryn/ui/components/ui/button";
import { TabPanel, Tabs, TabsList } from "@aevryn/ui/components/ui/tabs";
import { BellElectric, Bubbles, Sparkle, Volleyball } from "lucide-react";
import Link from "next/link";
import { LoginScreen } from "@/components/login-screen";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
	title: {
		absolute: "Aevryn · AI research agent for the live web",
	},
	description:
		"Search, scrape, and research the live web with your own API key. See every step your agent takes.",
};

import type { IconName } from "@aevryn/ui/lib/icon-context";

export default function Home() {
	// Seed content for the generated card group — replace with your own.
	const ITEMS: { icon: IconName; title: string; description: string }[] = [
		{
			icon: "circle",
			title: "Give it a task, not a tab",
			description:
				"Describe what you want in plain words and let the agent handle the rest.",
		},
		{
			icon: "shield",
			title: "Built on live data",
			description:
				"Search, scraping, crawling, and AI visibility run through real tools.",
		},
		{
			icon: "bot",
			title: "Web-native answers",
			description: "The agent answers from the web, not from memory.",
		},
		{
			icon: "moon",
			title: "Nothing is hardcoded",
			description:
				"One agent, one workflow. Plan today, research tomorrow, no redeploys.",
		},
	];

	// Seed content for the generated card group — replace with your own.
	const ITEMS2: { icon: IconName; title: string; description: string }[] = [
		{
			icon: "bot",
			title: "Bring your own key",
			description:
				"Paste a key from any OpenAI-compatible provider. Encrypted at rest, decrypted only while your agent runs, gone after the run.",
		},
	];

	return (
		<main className="container mx-auto flex h-full w-full max-w-7xl flex-col items-center justify-center border-r-2 border-l-2 border-dashed">
			<header className="flex w-full flex-row items-center justify-between border-b-2 border-dashed px-4 py-4 sm:px-8 lg:px-12">
				<div className="flex flex-row items-center justify-center gap-1">
					<Logo className="-ml-3.5 scale-80 sm:ml-0 sm:scale-100" />
				</div>
				<div className="flex flex-row items-center gap-4">
					<ThemeToggle />
					<Button asChild>
						<Link href="/signup">Sign Up</Link>
					</Button>
				</div>
			</header>

			<section className="flex w-full flex-col items-start gap-8 border-b-2 border-dashed p-4 sm:p-8 lg:p-12">
				<div className="flex w-full flex-col gap-4">
					<div className="hidden text-left text-[50px] text-foreground/90 leading-13.5 sm:block">
						Just ask <Logo size="xl" className="align-baseline" />
						<br />
						It handles your <span className="inline font-bold">questions</span>,
						and <span className="inline font-bold">busywork</span>.
					</div>
					<div className="text-[15px] text-muted-foreground leading-6">
						An agent that searches, scrapes, and researches the live web and
						shows <br />
						every step it took. Bring your own key. Keep your data.
					</div>
				</div>
				<div className="flex w-full flex-col gap-4">
					<div className="flex w-full flex-col gap-2 sm:flex-row">
						<Button asChild className="">
							<Link href="/signup">Try it now</Link>
						</Button>
						<Button variant="secondary" asChild className="">
							<Link href="#demo">See it in action</Link>
						</Button>
					</div>

					<div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
						<span className="flex flex-row items-center gap-1 text-[12px] text-muted-foreground">
							Use your keys:
						</span>
						<span className="flex flex-row items-center gap-1 text-[12px] text-muted-foreground">
							<Volleyball className="size-4 text-muted-foreground" />
							OpenAI
						</span>
						<span className="flex flex-row items-center gap-1 text-[12px] text-muted-foreground">
							<Bubbles className="size-4 text-muted-foreground" />
							Anthropic
						</span>
						<span className="flex flex-row items-center gap-1 text-[12px] text-muted-foreground">
							<Sparkle className="size-4 text-muted-foreground" />
							Google
						</span>
						<span className="flex flex-row items-center gap-1 text-[12px] text-muted-foreground">
							<BellElectric className="size-4 text-muted-foreground" /> And more
						</span>
					</div>
				</div>
				<div id="demo" className="flex w-full">
					<Tabs defaultValue="night" className="gap-4">
						<TabsList className="flex flex-row justify-end">
							<br />
						</TabsList>
						<br />
						<TabPanel value="night">
							<div>
								<img
									src="/aevryn.png"
									alt="Aevryn app interface in dark mode"
									className="w-full rounded-lg"
								/>
							</div>
						</TabPanel>
						<TabPanel value="day">
							<div>
								<img
									src="/aevryn.png"
									alt="Aevryn app interface in light mode"
									className="w-full rounded-lg"
								/>
							</div>
						</TabPanel>
					</Tabs>
				</div>{" "}
				{/* <div className="text-[13px] font-mono">Free launch generous usage, no card to sign up</div> */}
			</section>

			<section className="flex w-full flex-row items-center justify-center border-b-2 border-dashed px-4 py-4 sm:px-8 lg:px-12">
				<CardSection items={ITEMS} />
			</section>
			<section className="flex w-full flex-col items-center justify-between gap-8 border-b-2 border-dashed px-4 py-8 sm:px-8 lg:flex-row lg:px-12">
				<div className="flex hidden w-full min-w-0 flex-col gap-4 sm:flex">
					<div className="text-[28px] text-foreground leading-6">
						Two minutes, tops
					</div>
					<div className="text-[15px] text-muted-foreground leading-6">
						Sign in, drop in an API key, and type what you need the workflow
						you'd <br />
						have done by hand.
					</div>
					<div className="text-[12px] text-muted-foreground leading-6">
						*No subscription. Your key, your provider, your data.
					</div>
				</div>
				<div className="flex h-fit w-full min-w-0 flex-col items-center justify-between">
					{" "}
					<CardSection items={ITEMS2} className="-mt-2" />
					<LoginScreen />
				</div>
			</section>
			<section className="flex w-full flex-row items-center justify-between gap-4 border-b-2 border-dashed px-4 pt-4 pb-4 sm:flex-row sm:px-8 lg:px-12">
				<div className="hidden scale-[0.95] sm:block">
					<Logo size="sm" />
				</div>{" "}
				<div className="flex flex-row gap-4 text-[15px]">
					<a href="/privacy" className="text-muted-foreground underline">
						Privacy
					</a>
					<a href="/terms" className="text-muted-foreground underline">
						Terms
					</a>
				</div>{" "}
				<div className=" ">
					<p className="font-mono text-[15px] text-muted-foreground leading-6">
						&copy;2026 Aevryn
					</p>
				</div>
			</section>
			<section className="flex w-full flex-row items-center justify-center gap-4 p-8 pb-6">
				<img
					src="/aevryn-white.svg"
					alt=""
					aria-hidden
					className="hidden w-full opacity-10 dark:block"
				/>
				<img
					src="/aevryn-black.svg"
					alt=""
					aria-hidden
					className="w-full opacity-10 dark:hidden"
				/>
			</section>
		</main>
	);
}
