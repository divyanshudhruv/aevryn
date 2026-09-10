"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "@tanstack/react-query";

import { SearchableDropdown } from "@aevryn/ui/components/header/searchable-dropdown";
import InputGroup, {
  InputField,
} from "@aevryn/ui/components/ui/input-group";
import { Switch } from "@aevryn/ui/components/ui/switch";
import { Button } from "@aevryn/ui/components/ui/button";
import { NotificationsPanel } from "@aevryn/ui/components/notifications-panel";
import { MoreDialog } from "@aevryn/ui/components/more-dialog";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import type { MemoryInfo, NotificationInfo } from "@aevryn/ui/lib/chat-types";

import { trpc, queryClient } from "@/utils/trpc";

export function WorkspaceHeader({
  threadId,
  controls,
}: {
  threadId?: string;
  controls?: ReactNode;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : false;

  const BellIcon = useIcon("bell");
  const MoreIcon = useIcon("more-horizontal");

  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const unread = useQuery(trpc.agent.unreadNotifications.queryOptions());
  const notifications = useQuery(
    trpc.agent.listNotifications.queryOptions({ limit: 50 }),
  );
  const memories = useQuery(
    threadId
      ? trpc.agent.listThreadMemories.queryOptions({ workflowId: threadId })
      : trpc.agent.listMemories.queryOptions(),
  );

  const markAllRead = useMutation(
    trpc.agent.markNotificationsRead.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [["agent.unreadNotifications"]] });
        queryClient.invalidateQueries({ queryKey: [["agent.listNotifications"]] });
      },
    }),
  );
  const deleteMemory = useMutation(
    trpc.agent.deleteMemories.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [["agent.listMemories"]] });
        queryClient.invalidateQueries({ queryKey: [["agent.listThreadMemories"]] });
      },
    }),
  );
  const deleteAllMemory = useMutation(
    trpc.agent.deleteAllMemories.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [["agent.listMemories"]] });
        queryClient.invalidateQueries({ queryKey: [["agent.listThreadMemories"]] });
      },
    }),
  );

  const openNotifications = () => {
    setNotifOpen(true);
    if ((unread.data?.count ?? 0) > 0) {
      markAllRead.mutate({ notificationIds: [] });
    }
  };

  const notifItems: NotificationInfo[] = notifications.data ?? [];
  const memoryItems: MemoryInfo[] = memories.data ?? [];

  return (
    <header className="flex h-12 shrink-0 items-center px-4">
      <div className="flex w-full flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-px">
          <SearchableDropdown />
          <InputGroup className="mb-1">
            <InputField
              index={0}
              className="truncate"
              label=""
              placeholder="Search teamspaces..."
              value=""
              onChange={() => {}}
            />
          </InputGroup>
        </div>

        <div className="flex flex-row items-center gap-1">
          {controls}
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
          >
            <MoreIcon size={16} strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            onClick={openNotifications}
            aria-label="Notifications"
          >
            <BellIcon size={16} strokeWidth={1.75} />
            {(unread.data?.count ?? 0) > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
                {unread.data!.count}
              </span>
            )}
          </Button>
          <Switch
            label=""
            checked={isDark}
            onToggle={() => setTheme(isDark ? "light" : "dark")}
          />
        </div>
      </div>

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifItems}
        onMarkAllRead={() => markAllRead.mutate({ notificationIds: [] })}
      />

      <MoreDialog
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        threadId={threadId}
        memories={memoryItems}
        memoriesBusy={deleteAllMemory.isPending}
        onDeleteMemory={(id) => deleteMemory.mutate({ ids: [id] })}
        onDeleteAll={
          threadId
            ? undefined
            : () => deleteAllMemory.mutate()
        }
      />
    </header>
  );
}