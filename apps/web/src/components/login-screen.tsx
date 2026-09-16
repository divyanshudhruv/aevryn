"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabaseClient } from "@/lib/supabase-client";
import { Button } from "@aevryn/ui/components/ui/button";

export function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Always show Google's account chooser — never silently reuse
        // the provider session (stale accounts get picked otherwise).
        queryParams: { prompt: "select_account" },
      },
    });
    if (signInError) {
      setLoading(false);
      setError("Couldn't start sign-in. Try again.");
    }
  }

  return (
    <>
      <Button
        className="w-full gap-2"
        onClick={handleSignIn}
        disabled={loading}
      >
        {loading ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
