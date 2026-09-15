import { Suspense } from "react";

import { LoginScreen } from "@/components/login-screen";
import { Button } from "@aevryn/ui/components/ui/button";
import { CardSection } from "@aevryn/ui/components/card-section";
import {
  SquareLibrary,
  Clock,
  Star,
  Settings,
  LogIn,
  Volleyball,
  Sparkle,
  Bubbles,
  BellElectric,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabItem,
  TabPanel,
} from "@aevryn/ui/components/ui/tabs";
import { Logo } from "@/components/logo";

export const metadata = {
  title: "Home - Aevryn",
};
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";

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
        "Paste a key from any OpenAI-compatible provider. It's encrypted at rest, only decrypted when your agent runs and deleted after use. Trust us.",
    },
  ];

  return (
    <main className="container mx-auto flex h-full flex-col w-full max-w-7xl items-center justify-center border-l-2 border-r-2 gap-4 border-solid">
      <header className="border-b-2 border-dashed flex flex-row items-center justify-between w-full px-12 py-4">
        <div className="flex flex-row gap-1 items-center justify-center">
          <Logo className="size-9" />
          evryn
        </div>
        <Button>Sign Up</Button>
      </header>

      <section className="border-b-2 border-dashed flex flex-col items-start w-full gap-4 p-12">
        <div className="text-[50px] leading-13.5 text-foreground/90 inline">
          Just ask <Logo className="inline size-12 mb-2" /> aevryn.
          <br />
          Your
          <span className="inline font-bold"> keys</span>,
          <span className="inline font-bold"> questions</span>, and{" "}
          <span className="inline font-bold"> workflows</span>.
        </div>
        <div className="text-muted-foreground text-[13px] leading-6 inline">
          An agent that searches, scrapes, and researches the live web, <br />
          then shows you every step it took. Bring your own key. Keep your data.
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-row gap-2">
            <Button>Try it now</Button>
            <Button variant="secondary">Sign Up</Button>
          </div>

          <div className="flex flex-row gap-4">
            <span className="text-[11px] flex flex-row gap-1 items-center text-muted-foreground ">
              Use your own key:
            </span>
            <span className="text-[11px] flex flex-row gap-1 items-center text-muted-foreground">
              <Volleyball className="size-4 text-muted-foreground" />
              OpenAI
            </span>
            <span className="text-[11px] flex flex-row gap-1 items-center text-muted-foreground">
              <Bubbles className="size-4 text-muted-foreground" />
              Anthropic
            </span>
            <span className="text-[11px] flex flex-row gap-1 items-center text-muted-foreground">
              <Sparkle className="size-4 text-muted-foreground" />
              Google
            </span>
            <span className="text-[11px] flex flex-row gap-1 items-center text-muted-foreground">
              <BellElectric className="size-4 text-muted-foreground" /> And more
            </span>
          </div>
        </div>
        <br />
        <div className="flex w-full">
          <Tabs defaultValue="night" className="gap-4">
            <TabsList className="flex flex-row justify-end">
              <br />
            </TabsList>
            <br />
            <TabPanel value="night">
              <div>
                <img src="/aevryn.png" className="rounded-lg" />
              </div>
            </TabPanel>
            <TabPanel value="day">
              <div>
                <img src="/aevryn.png" className="rounded-lg" />
              </div>
            </TabPanel>
          </Tabs>
        </div>{" "}
        {/* <div className="text-[13px] font-mono">Free launch generous usage, no card to sign up</div> */}
      </section>

      <section className="border-b-2 border-dashed flex flex-row items-center justify-center w-full px-12 py-4">
        <CardSection items={ITEMS} />
      </section>
      <section className="border-b-2 border-dashed flex flex-row items-center justify-between w-full px-12 py-4">
        <div className="flex flex-col gap-4 w-full">
          <div className="text-foreground text-[28px] leading-6">
            Two minutes, tops
          </div>
          <div className="text-muted-foreground text-[13px] leading-6">
            Sign in, drop in an API key, and type what you need. The first
            workflow is <br />
            usually the one you were about to do by hand.
          </div>
          <div className="text-muted-foreground text-[11px] leading-6">
            *BYOK
          </div>
        </div>
        <div className="flex flex-col w-full items-center h-full  justify-between">
          {" "}
          <CardSection items={ITEMS2} />
          <LoginScreen />
        </div>
      </section>
    </main>
  );
}
