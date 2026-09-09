"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { SearchableDropdown } from "@aevryn/ui/components/header/searchable-dropdown";
import InputGroup, {
  InputField,
} from "@aevryn/ui/components/ui/input-group";
import { Switch } from "@aevryn/ui/components/ui/switch";

export function WorkspaceHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : false;

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

        <div className="flex flex-row items-center gap-2">
          <Switch
            label=""
            checked={isDark}
            onToggle={() => setTheme(isDark ? "light" : "dark")}
          />
        </div>
      </div>
    </header>
  );
}