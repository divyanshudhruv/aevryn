"use client";
import { Button } from "@aevryn/ui/components/ui/button";
import {
	DropdownContent,
	DropdownEmpty,
	DropdownLabel,
	DropdownMenu,
	DropdownSearch,
	DropdownTrigger,
} from "@aevryn/ui/components/ui/dropdown";
import MenuItem from "@aevryn/ui/components/ui/menu-item";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const WORKFLOW_GROUPS = [
	{
		title: "Personal",
		items: [
			"New pricing page exploration",
			"Component library audit",
			"Dark mode token pass",
		],
	},
	{
		title: "Site",
		items: ["Scrollbar fade regression", "Registry deploy pipeline"],
	},
	{
		title: "Workflows",
		items: [
			"Compare Framework 16 vs MacBook",
			"Monitor product price drop",
			"Summarize weekly changelogs",
			"Fill job application form",
		],
	},
];

export function SearchableDropdown() {
	const [workflow, setWorkflow] = useState("Monitor product price drop");
	const [query, setQuery] = useState("");

	const matches = WORKFLOW_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) =>
			item.toLowerCase().includes(query.toLowerCase()),
		),
	})).filter((group) => group.items.length > 0);

	const rows: { kind: "group" | "item"; label: string }[] = [];
	let checkedFlatIndex: number | undefined;
	for (const group of matches) {
		rows.push({ kind: "group", label: group.title });
		for (const item of group.items) {
			if (item === workflow) checkedFlatIndex = rows.length;
			rows.push({ kind: "item", label: item });
		}
	}

	return (
		<DropdownMenu>
			<DropdownTrigger
				render={
					<Button variant="ghost" trailingIcon={ChevronDown}>
						{workflow}
					</Button>
				}
			/>
			<DropdownContent checkedIndex={checkedFlatIndex}>
				<DropdownSearch
					value={query}
					onValueChange={setQuery}
					placeholder="Search workflows"
				/>
				{rows.map((row, i) =>
					row.kind === "group" ? (
						<DropdownLabel key={row.label}>{row.label}</DropdownLabel>
					) : (
						<MenuItem
							key={row.label}
							index={i}
							label={row.label}
							checked={workflow === row.label}
							onSelect={() => setWorkflow(row.label)}
						/>
					),
				)}
				{rows.length === 0 && <DropdownEmpty>No workflows found</DropdownEmpty>}
			</DropdownContent>
		</DropdownMenu>
	);
}
