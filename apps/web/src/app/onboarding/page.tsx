import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding-flow";
import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { requireUser } from "@aevryn/auth";
import {
	getProfileOrCreate,
	syncProfileFromAuth,
} from "@/lib/profile";

export const metadata = {
  title: "Onboarding — Aevryn",
};

export default async function OnboardingPage() {
	const supabase = await createServerSupabaseForNext();
	const user = await requireUser(supabase);

	// Fallback sync: covers users who land here without passing the callback
	// sync (e.g. stale session). Non-fatal on failure.
	await syncProfileFromAuth(supabase, user.id, {
		name: user.name,
		email: user.email,
		pfp: user.avatarUrl,
	});

	const profile = await getProfileOrCreate(supabase, user.id);



  return (
    <main className="container mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Welcome to Aevryn</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A few questions to tailor your experience. You can change these
          answers anytime from your profile.
        </p>
      </div>
      <div className="w-full max-w-xl">
        <OnboardingFlow />
      </div>
    </main>
  );
}
