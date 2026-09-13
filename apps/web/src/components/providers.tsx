"use client";

import { useEffect } from "react";

import { SizeProvider } from "@aevryn/ui/lib/size-context";

import { ThemeProvider } from "./theme-provider";

const SCRIPT_TAG_WARNING =
  "Encountered a script tag while rendering React component";
const isScriptTagWarning = (error: unknown): error is string => {
  return typeof error === "string" && error.includes(SCRIPT_TAG_WARNING);
};

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prev = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes(SCRIPT_TAG_WARNING)) {
        return;
      }
      prev(...args);
    };
    return () => {
      console.error = prev;
    };
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <SizeProvider>{children}</SizeProvider>
    </ThemeProvider>
  );
}
