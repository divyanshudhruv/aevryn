"use client";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownSearch,
  DropdownEmpty,
} from "@aevryn/ui/components/ui/dropdown";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@aevryn/ui/components/ui/button";
import MenuItem from "@aevryn/ui/components/ui/menu-item";

const LANGUAGES = [
  "Auto detect",
  "Albanian (Albania)",
  "Arabic",
  "Bengali" /* … */,
];

export function SearchableDropdown() {
  const [language, setLanguage] = useState("Auto detect");
  const [query, setQuery] = useState("");

  // Filter the rows you render; the popup re-indexes from 0 each time.
  const matches = LANGUAGES.filter((l) =>
    l.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <Button variant="ghost" trailingIcon={ChevronDown}>
            {language}
          </Button>
        }
      />
      <DropdownContent checkedIndex={matches.indexOf(language)}>
        <DropdownSearch
          value={query}
          onValueChange={setQuery}
          placeholder="Search languages"
        />
        {matches.map((l, i) => (
          <MenuItem
            key={l}
            index={i}
            label={l}
            checked={language === l}
            onSelect={() => setLanguage(l)}
          />
        ))}
        {matches.length === 0 && (
          <DropdownEmpty>No languages found</DropdownEmpty>
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}
