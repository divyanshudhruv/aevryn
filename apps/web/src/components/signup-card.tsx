"use client";

import { useState } from "react";

import { supabaseClient } from "@/lib/supabase-client";
import { Button } from "@aevryn/ui/components/ui/button";
import { Logo } from "./logo";

export function SignUpCard() {
  const [signInActive, setSignInActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setLoading(false);
      setError("Couldn't start sign-in. Try again.");
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      {" "}
      <Logo size="md" className="justify-start " />
      <div className="flex flex-col gap-2 text-left justify-start">
        {" "}
        <h1 className="text-foreground text-2xl font-normal leading-tight">
          Start your journey
        </h1>
        <p className="text-muted-foreground text-sm leading-1">
          Bring your own key. Keep your data.
        </p>
      </div>
      <Button
        className="w-full gap-2"
        onClick={handleSignIn}
        // disabled={loading}
        loading={loading}
      >
        Continue with Google
      </Button>
      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
