"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownEmpty,
} from "@aevryn/ui/components/ui/dropdown";
import { Button } from "@aevryn/ui/components/ui/button";
import MenuItem from "@aevryn/ui/components/ui/menu-item";

import { trpc } from "@/utils/trpc";

export function ThreadSwitcher({ activeId }: { activeId?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data } = useQuery(trpc.agent.listRuns.queryOptions({ limit: 50 }));

  const threads = data ?? [];
  const matches = threads.filter((t) =>
    (t.workflow.objective ?? "").toLowerCase().includes(query.toLowerCase()),
  );
  const active = threads.find((t) => t.workflow.id === activeId);
  const activeLabel = active
    ? active.workflow.objective ?? "Untitled thread"
    : "Switch thread";

  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <Button variant="ghost" trailingIcon={ChevronDown}>
            <span className="max-w-40 truncate">{activeLabel}</span>
          </Button>
        }
      />
      <DropdownContent checkedIndex={matches.findIndex((t) => t.workflow.id === activeId)}>
        <DropdownSearch
          value={query}
          onValueChange={setQuery}
          placeholder="Search threads"
        />
        {matches.map((t, i) => (
          <MenuItem
            key={t.workflow.id}
            index={i}
            label={t.workflow.objective ?? "Untitled thread"}
            checked={t.workflow.id === activeId}
            onSelect={() => router.push(`/workspace/${t.workflow.id}`)}
          />
        ))}
        {matches.length === 0 && (
          <DropdownEmpty>
            {threads.length === 0 ? "No threads yet." : "No matches."}
          </DropdownEmpty>
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}