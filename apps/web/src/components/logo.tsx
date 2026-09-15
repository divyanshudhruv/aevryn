"use client";

import { useTheme } from "next-themes";

export function Logo({ className }: { className?: string }) {
  const { theme } = useTheme();
  const invertedLogo = theme === "dark" ? "invert(100%)" : "";
  return (
    <img
      src="/logo.svg"
      alt="Evryn"
      className={className}
      style={{ filter: invertedLogo }}
    />
  );
}
