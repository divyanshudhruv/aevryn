"use client";

import { FileThumbnail } from "@aevryn/ui/components/ui/file-thumbnail";
import { useTouchPrimary } from "@aevryn/ui/hooks/use-touch-primary";
import { useShape } from "@aevryn/ui/lib/shape-context";
import { type SizeVariant, useSize } from "@aevryn/ui/lib/size-context";
import { spring } from "@aevryn/ui/lib/springs";
import { cn } from "@aevryn/ui/lib/utils";
import { type HTMLMotionProps, motion } from "framer-motion";
import { forwardRef, type ReactNode } from "react";

interface ChatMessageProps extends Omit<HTMLMotionProps<"div">, "children"> {
	from: "user" | "assistant";
	files?: File[];
	thumbnailSize?: number;
	time?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
	size?: SizeVariant;
}

const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
	(
		{
			from,
			files,
			thumbnailSize = 64,
			time,
			actions,
			children,
			size,
			className,
			...props
		},
		ref,
	) => {
		const shape = useShape();
		const compact = useSize(size).variant === "compact";
		const isUser = from === "user";
		const isTouch = useTouchPrimary();
		const showTime = time != null;

		return (
			<motion.div
				ref={ref}
				layout="position"
				initial={{ opacity: 0, y: 8, scale: 0.96 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={spring.moderate}
				style={{ transformOrigin: isUser ? "bottom right" : "bottom left" }}
				className={cn(
					"group flex flex-col gap-1.5",
					isUser
						? "max-w-[80%] items-end self-end"
						: "w-full max-w-full items-start self-start sm:max-w-[80%]",
					className,
				)}
				{...props}
			>
				{files && files.length > 0 && (
					<div
						className={cn(
							"flex flex-wrap gap-1.5",
							isUser ? "justify-end" : "justify-start",
						)}
					>
						{files.map((file, i) => (
							<FileThumbnail
								key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
								file={file}
								size={thumbnailSize}
							/>
						))}
					</div>
				)}
				{children != null && children !== "" && (
					<div
						className={cn(
							!isUser && "w-full",
							"flex flex-col",
							isUser ? "gap-1.5" : "gap-5",
							"whitespace-pre-wrap break-words",
							compact ? "py-1.5 text-[13px]" : "py-2 text-[14px]",
							isUser
								? cn(
										shape.bg,
										compact ? "px-3" : "px-3.5",
										"text-pretty bg-[color-mix(in_oklab,var(--accent),var(--background)_25%)] text-accent-foreground",
									)
								: "text-foreground",
						)}
					>
						{children}
					</div>
				)}
				{(showTime || actions != null) && (
					<div
						className={cn(
							"flex select-none items-center gap-2 whitespace-nowrap px-1 text-muted-foreground leading-none",
							compact ? "text-[11px]" : "text-[12px]",
							!isTouch && [
								"opacity-0 transition-opacity duration-150",
								"group-hover:opacity-100",
								"group-focus-within:opacity-100",
							],
						)}
					>
						{showTime && <span className="tabular-nums">{time}</span>}
						{actions != null && (
							<span className="flex shrink-0 items-center gap-2 py-1">
								{actions}
							</span>
						)}
					</div>
				)}
			</motion.div>
		);
	},
);

ChatMessage.displayName = "ChatMessage";

export type { ChatMessageProps };
export { ChatMessage };
export default ChatMessage;
