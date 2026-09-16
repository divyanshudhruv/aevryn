import { Logo } from "@/components/logo";
import { SignUpCard } from "@/components/signup-card";

export const metadata = {
  title: "Sign up",
  description: "Create your Aevryn account and start with your own key.",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-svh flex-col justify-between gap-4">
  <div></div>
      <div className="flex items-center justify-center px-4">
        <SignUpCard />
      </div>
      <footer className="flex items-center justify-center gap-1 py-4 text-xs">
        <a
          href="/terms"
          className="text-xs text-muted-foreground underline-offset-4 underline"
        >
          Terms of Service{" "}
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          className="text-xs text-muted-foreground underline-offset-4 underline"
        >
          Privacy Policy
        </a>
      </footer>
    </div>
  );
}
