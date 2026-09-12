"use client";

import { SearchableDropdown } from "@aevryn/ui/components/header/searchable-dropdown";
import { InputGroup, InputField } from "@aevryn/ui/components/ui/input-group";

export function Header() {
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
              id="name of the workflow, can be renamed on typing and when onfocus changes"
              placeholder=""
              value={"Compare prices of Framework Laptop 16 and Apple Macbook"}
              onChange={() => {}}
            />
          </InputGroup>
        </div>
      </div>
    </header>
  );
}
