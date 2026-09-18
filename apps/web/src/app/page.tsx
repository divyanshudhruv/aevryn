import { getCurrentUser } from "@aevryn/auth";
import { redirect } from "next/navigation";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const metadata = {
	title: {
		absolute: "Aevryn · AI research agent for the live web",
	},
	description:
		"Search, scrape, and research the live web with your own API key. See every step your agent takes.",
};

export default async function Home() {
	const supabase = await createServerSupabaseForNext();
	const user = await getCurrentUser(supabase);
	redirect(user ? "/workspace" : "/home");
}
