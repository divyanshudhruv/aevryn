"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@aevryn/ui/components/ui/dialog";
import { Button } from "@aevryn/ui/components/ui/button";
import { ScrollArea } from "@aevryn/ui/components/ui/scroll-area";

interface Notification {
  id: string;
  content: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "notif_1",
    content: "Retry checkout flow failed after 3 attempts.",
    read: false,
  },
  {
    id: "notif_2",
    content: "Summarize weekly changelogs is now running.",
    read: false,
  },
  {
    id: "notif_3",
    content: "Monitor product price drop found a price below ₹5,000.",
    read: true,
  },
  {
    id: "notif_4",
    content: "Fill job application form is awaiting your approval.",
    read: false,
  },
  {
    id: "notif_5",
    content: "Scrape internship listings finished successfully.",
    read: true,
  },
];

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string | ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/60 py-4 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-foreground">{label}</span>
        {description && (
          <div className="w-full text-[12px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export interface NotificationsDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NotificationsDialog({
  open,
  defaultOpen,
  onOpenChange,
}: NotificationsDialogProps) {
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  const markAllAsRead = () =>
    setNotifications((items) =>
      items.map((n) => (n.read ? n : { ...n, read: true })),
    );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <div className="mb-2 flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1.5">
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                : "You're all caught up."}
            </DialogDescription>
          </div>
      
        </div>

          <div className="flex flex-col">
          
            {notifications.map((m) => (
              <SettingRow key={m.id} label={m.id} description={m.content}>
                {!m.read && (
                  <span className="size-2 shrink-0 rounded-full bg-foreground/60" />
                )}
              </SettingRow>
            ))}
          </div>
      </DialogContent>
    </Dialog>
  );
}