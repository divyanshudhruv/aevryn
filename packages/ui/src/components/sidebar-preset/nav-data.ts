import type { ExecutionStatus } from "@aevryn/db/domain";

/** Sidebar row status vocabulary = execution lifecycle only. */
export type NavItemStatus = ExecutionStatus;

export interface NavItem {
  label: string;
  /** Execution status: drives the leading indicator and is stamped as `data-status`. */
  status: NavItemStatus;
  badge?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "PERSONAL",
    items: [
      { label: "New pricing page exploration", status: "pending", badge: "2" },
      { label: "Component library audit", status: "waiting", badge: "5" },
      { label: "Dark mode token pass", status: "running", badge: "3" },
    ],
  },
  {
    label: "SITE",
    items: [
      { label: "Scrollbar fade regression", status: "sleeping", badge: "1" },
      { label: "Registry deploy pipeline", status: "completed", badge: "4" },
    ],
  },
  {
    label: "WORKFLOWS",
    items: [
      { label: "Compare Framework 16 vs MacBook", status: "running" },
      { label: "Monitor product price drop", status: "running" },
      { label: "Summarize weekly changelogs", status: "waiting" },
      { label: "Fill job application form", status: "awaiting_approval" },
      { label: "Scrape internship listings", status: "completed" },
      { label: "Queue onboarding follow-ups", status: "pending" },
      { label: "Sleep until market opens", status: "sleeping" },
      { label: "Retry checkout flow", status: "failed" },
      { label: "Cancel stale reservations", status: "cancelled" },
    ],
  },
];
