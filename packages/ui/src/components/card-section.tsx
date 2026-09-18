"use client";

import {
	Card,
	CardDescription,
	CardGroup,
	CardHeader,
	CardMedia,
	CardTitle,
} from "@aevryn/ui/components/card";
import { type IconName, useIcons } from "@aevryn/ui/lib/icon-context";
import { cn } from "@aevryn/ui/lib/utils";

export function CardSection({
	items,
	className,
}: {
	items: Array<{ title: string; description: string; icon: IconName }>;
	className?: string;
}) {
	const icons = useIcons();

	const gridCols =
		items.length >= 4
			? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
			: items.length === 3
				? "grid-cols-1 sm:grid-cols-3"
				: items.length === 2
					? "grid-cols-1 sm:grid-cols-2"
					: "grid-cols-1";

	return (
		<div className="w-full">
			<CardGroup
				orientation="inline"
				separated
				className={cn("grid w-full gap-4", gridCols, className)}
			>
				{items.map((item) => (
					<Card key={item.title} className="w-full">
						<CardMedia icon={icons[item.icon]} />
						<CardHeader>
							<CardTitle>{item.title}</CardTitle>
							<CardDescription className="text-[12px]">
								{item.description}
							</CardDescription>
						</CardHeader>
					</Card>
				))}
			</CardGroup>
		</div>
	);
}
