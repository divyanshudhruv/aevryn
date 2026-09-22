"use client";

import {
	collapsedStackHeight,
	QueuedStack,
	useQueueCardHeight,
} from "@aevryn/ui/components/queued-stack";
import { Button } from "@aevryn/ui/components/ui/button";
import {
	DropdownContent,
	DropdownLabel,
	DropdownMenu,
	DropdownTrigger,
} from "@aevryn/ui/components/ui/dropdown";
import { FileThumbnail } from "@aevryn/ui/components/ui/file-thumbnail";
import {
	InputMessage,
	type QueuedMessage,
} from "@aevryn/ui/components/ui/input-message";
import { MenuItem } from "@aevryn/ui/components/ui/menu-item";
import { Slider } from "@aevryn/ui/components/ui/slider";
import { Tooltip } from "@aevryn/ui/components/ui/tooltip";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { useShape } from "@aevryn/ui/lib/shape-context";
import { spring } from "@aevryn/ui/lib/springs";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
	"Monitor this product and notify me when its price drops below ₹5,000",
	"Scrape these internship listings every week and summarize new ones",
	"Fill out this job application form for me",
	"Wake me up daily at 8 AM with a summary of my pending workflows",
];

interface Message {
	id: string;
	from: "user" | "assistant";
	text: string;
	files: File[];
}

export function ChatComposer({
	onSend,
	onStop,
	status = "idle",
	onThinkingChange,
}: {
	onSend?: (text: string) => void;
	onStop?: () => void;
	status?: "idle" | "streaming";
	onThinkingChange?: (effort: string) => void;
}) {
	const shape = useShape();
	const PlusIcon = useIcon("plus");
	const ChevronDownIcon = useIcon("chevron-down");
	const cardH = useQueueCardHeight();
	const [value, setValue] = useState("");
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "seed",
			from: "user",
			text: "",
			files: [],
		},
	]);
	const [files, setFiles] = useState<File[]>([]);
	const [queue, setQueue] = useState<QueuedMessage[]>([]);
	const [quality, setQuality] = useState(30000);
	const [displayQuality, setDisplayQuality] = useState(30000);
	const releaseQuality = () => setDisplayQuality(quality);

	const thinkingEfforts = ["Low", "Medium", "High", "Ultra", "God"] as const;
	const [thinking, setThinking] = useState("Medium");

	const [morphingId, setMorphingId] = useState<string | null>(null);
	const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
		},
		[],
	);

	const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
		},
		[],
	);

	const inputRef = useRef<HTMLDivElement>(null);
	const [inputH, setInputH] = useState(0);
	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setInputH(el.offsetHeight));
		ro.observe(el);
		setInputH(el.offsetHeight);
		return () => ro.disconnect();
	}, []);

	const scrollRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, []);

	const editQueued = (item: QueuedMessage) => {
		setValue(item.text);
		setFiles(item.files);
		setQueue((q) => q.filter((x) => x.id !== item.id));
		requestAnimationFrame(() => {
			const el = inputRef.current?.querySelector("textarea");
			if (el) {
				el.focus();
				el.setSelectionRange(el.value.length, el.value.length);
			}
		});
	};

	const collapsedStackH = collapsedStackHeight(queue.length, cardH);

	return (
		<div
			className="relative w-full self-stretch"
			style={{ height: Math.max(inputH, 56) }}
		>
			<div
				ref={scrollRef}
				className="scrollbar-hide absolute inset-0 overflow-y-auto"
			>
				<div
					className="flex min-h-full flex-col justify-start gap-2"
					style={{
						paddingBottom:
							inputH + 8 + (queue.length > 0 ? collapsedStackH + 8 : 0),
					}}
				>
					{messages.map((m) =>
						m.from === "assistant" ? (
							<div
								key={m.id}
								className="pointer-events-none max-w-[80%] select-none self-start whitespace-pre-wrap break-words py-2 text-[14px] text-foreground opacity-0"
							>
								{m.text}
							</div>
						) : m.id === morphingId ? (
							<motion.div
								key={m.id}
								layoutId={`qm-${m.id}`}
								layout
								initial={false}
								transition={spring.moderate}
								style={{ transformOrigin: "bottom right" }}
								className={`max-w-[80%] self-end whitespace-pre-wrap text-pretty break-words bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] px-3.5 py-2 text-[14px] text-accent-foreground ${shape.bg}`}
							>
								<motion.span layout className="inline-block align-top">
									{m.text}
								</motion.span>
							</motion.div>
						) : (
							<div
								key={m.id}
								className="pointer-events-none flex max-w-[80%] select-none flex-col items-end gap-1.5 self-end opacity-0"
								aria-hidden="true"
							>
								{m.files.length > 0 && (
									<div className="flex flex-wrap justify-end gap-1.5">
										{m.files.map((file, fi) => (
											<FileThumbnail
												key={`${file.name}-${fi}`}
												file={file}
												size={64}
											/>
										))}
									</div>
								)}
								{m.text !== "" && (
									<div
										className={`whitespace-pre-wrap text-pretty break-words bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] px-3.5 py-2 text-[14px] text-accent-foreground ${shape.bg}`}
									>
										{m.text}
									</div>
								)}
							</div>
						),
					)}
				</div>
			</div>

			<QueuedStack
				queue={queue}
				onQueueChange={setQueue}
				onEdit={editQueued}
				onRemove={(item) => setQueue((q) => q.filter((x) => x.id !== item.id))}
				bottom={inputH + 8}
				morphLayoutId={(item) => `qm-${item.id}`}
			/>

			<InputMessage
				ref={inputRef}
				className="absolute inset-x-0 bottom-0 bg-background/45"
				value={value}
				onValueChange={setValue}
				onSend={(text, sent, meta) => {
					if (text || sent.length) {
						const id = meta?.queuedId ?? crypto.randomUUID();
						setMessages((m) => [...m, { id, from: "user", text, files: sent }]);
						if (text) onSend?.(text);
						if (meta?.queuedId && sent.length === 0) {
							setMorphingId(meta.queuedId);
							if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
							morphTimerRef.current = setTimeout(
								() => setMorphingId(null),
								450,
							);
						}
					}
					if (!meta?.queuedId) {
						setValue("");
						setFiles([]);
					}
				}}
				placeholderSuggestion="Research <topic> for me and summarize"
				suggestions={SUGGESTIONS}
				history={messages
					.filter((m) => m.from === "user")
					.map((m) => m.text)
					.filter(Boolean)}
				files={files}
				onFilesChange={setFiles}
				leftSlot={({ openFilePicker }) => (
					<Tooltip content="Attach" side="top">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Attach files"
							onClick={() => openFilePicker()}
						>
							<PlusIcon />
						</Button>
					</Tooltip>
				)}
				rightSlot={
					<div className="flex items-center gap-1">
						<Tooltip content="Thinking effort" side="top">
							<DropdownMenu>
								<DropdownTrigger
									render={
										<Button
											variant="ghost"
											size="sm"
											trailingIcon={ChevronDownIcon}
											aria-label="Thinking effort"
										>
											{thinking}
										</Button>
									}
								/>
								<DropdownContent className="w-48">
									<DropdownLabel>Thinking Effort</DropdownLabel>
									{thinkingEfforts.map((effort, index) => (
										<MenuItem
											key={effort}
											index={index}
											label={effort}
											checked={thinking === effort}
											onClick={() => {
												setThinking(effort);
												onThinkingChange?.(effort.toLowerCase());
											}}
										/>
									))}
								</DropdownContent>
							</DropdownMenu>
						</Tooltip>
						<Tooltip content="Max output tokens" side="top">
							<DropdownMenu>
								<DropdownTrigger
									render={
										<Button
											variant="ghost"
											size="sm"
											trailingIcon={ChevronDownIcon}
											aria-label="Max output tokens"
										>
											{displayQuality >= 1000
												? `${Math.round(displayQuality)}`
												: displayQuality.toLocaleString()}
										</Button>
									}
								/>
								<DropdownContent className="!important p-0">
									<Slider
										label="Max Output Tokens"
										className="p-4"
										value={quality}
										onChange={(v) => setQuality(Array.isArray(v) ? v[0] : v)}
										onPointerUp={releaseQuality}
										min={5000}
										max={50000}
										step={5000}
										formatValue={(v) => `${v.toLocaleString()} tokens`}
									/>
								</DropdownContent>
							</DropdownMenu>
						</Tooltip>
					</div>
				}
				status={status}
				queue={queue}
				onQueueChange={setQueue}
				onStop={() => {
					if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
					onStop?.();
				}}
				showQueue={false}
			/>
		</div>
	);
}
