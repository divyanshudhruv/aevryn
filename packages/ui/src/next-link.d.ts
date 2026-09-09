// Ambient stand-in for `next/link` so the ui package typechecks without a
// `next` dependency installed. Consumers running inside a Next.js app resolve
// the real next/link instead (their program shadows this declaration), so runtime
// behavior is unchanged — this only widens `href` past the typed-routes union.
declare module "next/link" {
  import type { AnchorHTMLAttributes, ReactNode } from "react";

  export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string | { pathname: string; query?: string };
    legacyBehavior?: boolean;
    prefetch?: boolean;
    children?: ReactNode;
  }

  declare const Link: (props: LinkProps) => ReactNode;
  export default Link;
}