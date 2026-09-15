"use client";

import {
  Card,
  CardGroup,
  CardHeader,
  CardTitle,
  CardDescription,
  CardMedia,
} from "@aevryn/ui/components/card";
import { useIcons, type IconName } from "@aevryn/ui/lib/icon-context";

export function CardSection({
  items,
}: {
  items: Array<{ title: string; description: string; icon: IconName }>;
}) {
  const icons = useIcons();
  return (
    <div className="w-full flex flex-row">
      <CardGroup orientation="inline" separated className="flex flex-row">
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
