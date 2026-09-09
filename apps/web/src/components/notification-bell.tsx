"use client";

import { Button } from "@aevryn/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@aevryn/ui/components/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, MailOpenIcon } from "lucide-react";

import { trpc } from "@/utils/trpc";

export function NotificationBell() {
	const queryClient = useQueryClient();
	const unread = useQuery({
		...trpc.agent.unreadNotifications.queryOptions(),
		refetchInterval: 30_000,
	});
	const notifications = useQuery({
		...trpc.agent.listNotifications.queryOptions({ limit: 20 }),
		refetchInterval: 30_000,
	});

	const markRead = useMutation({
		...trpc.agent.markNotificationsRead.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: trpc.agent.unreadNotifications.queryKey(),
			});
			queryClient.invalidateQueries({
				queryKey: trpc.agent.listNotifications.queryKey(),
			});
		},
	});

	const count = unread.data?.count ?? 0;

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (open) {
					queryClient.invalidateQueries({
						queryKey: trpc.agent.unreadNotifications.queryKey(),
					});
				}
			}}
		>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="relative"
					/>
				}
			>
				<BellIcon className="size-4" />
				{count > 0 ? (
					<span
						className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-semibold text-[10px] text-primary-foreground"
						aria-hidden="true"
					>
						{count > 9 ? "9+" : count}
					</span>
				) : null}
				<span className="sr-only">
					Notifications{count > 0 ? ` (${count} unread)` : ""}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-80">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="flex items-center justify-between">
						<span>Notifications</span>
						{count > 0 ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={markRead.isPending}
								onClick={() => markRead.mutate({})}
							>
								<MailOpenIcon className="mr-1 size-3.5" />
								{markRead.isPending ? "Marking…" : "Mark all read"}
							</Button>
						) : null}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{notifications.data && notifications.data.length > 0 ? (
						notifications.data.map((notification) => (
							<DropdownMenuItem
								key={notification.id}
								onSelect={() => {
									if (!notification.readAt) {
										markRead.mutate({
											notificationIds: [notification.id],
										});
									}
								}}
							>
								<div className="flex min-w-0 flex-col gap-0.5">
									<p className="truncate font-medium">
										{notification.subject ?? notification.type}
										{notification.readAt ? null : (
											<span className="ml-2 inline-block size-1.5 rounded-full bg-primary align-middle" />
										)}
									</p>
									<p className="truncate text-muted-foreground">
										{new Date(notification.createdAt).toLocaleString()}
									</p>
								</div>
							</DropdownMenuItem>
						))
					) : (
						<DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
