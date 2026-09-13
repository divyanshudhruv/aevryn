export interface NavItem {
  label: string;
  /** Semantic status: drives the leading dot and screen-reader text. */
  status: "active" | "unread" | "idle";
  badge?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "fluid-functionalism",
    items: [
    { label: "New pricing page exploration", status: "active", badge: "2" },
    { label: "Component library audit", status: "idle", badge: "5" },
    { label: "Dark mode token pass", status: "unread", badge: "3" },
    ],
  },
  {
    label: "portfolio-site",
    items: [
    { label: "Scrollbar fade regression", status: "idle", badge: "1" },
    { label: "Registry deploy pipeline", status: "unread", badge: "4" },
    ],
  },
];
