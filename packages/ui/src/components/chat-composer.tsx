"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  InputMessage,
  type QueuedMessage,
} from "@aevryn/ui/components/ui/input-message";
import { Button } from "@aevryn/ui/components/ui/button";
import { Tooltip } from "@aevryn/ui/components/ui/tooltip";
import { FileThumbnail } from "@aevryn/ui/components/ui/file-thumbnail";
import {
  QueuedStack,
  collapsedStackHeight,
  useQueueCardHeight,
} from "@aevryn/ui/components/queued-stack";
import { useIcon } from "@aevryn/ui/lib/icon-context";
import { useShape } from "@aevryn/ui/lib/shape-context";
import { spring } from "@aevryn/ui/lib/springs";
import { Slider } from "@aevryn/ui/components/ui/slider";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
} from "@aevryn/ui/components/ui/dropdown";

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

export interface ChatComposerProps {
  /** Fired for a fresh user submit (not queued dispatches). Lets the host
   *  wire sendMessage/thread-creation without touching the internal demo
   *  transcript. */
  onSubmitMessage?: (text: string) => void;
  /** Demo mode: seeds a fake transcript and simulates streaming replies.
   *  Set false for the real workspace surfaces. */
  demo?: boolean;
  /** Disables sends while true. Host wires this to UI state (e.g. an
   *  approval waiting on the user). */
  disabled?: boolean;
}

export function ChatComposer({
  onSubmitMessage,
  demo = true,
  disabled = false,
}: ChatComposerProps) {
  const shape = useShape();
  const PlusIcon = useIcon("plus");
  const ChevronDownIcon = useIcon("chevron-down");
  const cardH = useQueueCardHeight();
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Message[]>(
    demo
      ? [
          {
            id: "seed",
            from: "user",
            text: "Make my input box feel less stiff",
            files: [],
          },
        ]
      : [],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  // Seeded mid-stream (the preset's configuration): sends enqueue
  // immediately; Stop flips to idle and dispatches the head.
  const [status, setStatus] = useState<"idle" | "streaming">(
    demo ? "streaming" : "idle",
  );
  const qualityLabels = ["Free", "Low", "Medium", "High", "Ultra", "God"];
  const [quality, setQuality] = useState(30000);
  const [displayQuality, setDisplayQuality] = useState(30000);
  const releaseQuality = () => setDisplayQuality(quality);

  // The id of the message currently playing its queued→sent morph. The
  // morph props are applied ONLY to this one, ONLY for the brief
  // transition — then cleared, so a settled bubble never re-animates its
  // layout when the transcript reflows underneath it.
  const [morphingId, setMorphingId] = useState<string | null>(null);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
    },
    [],
  );

  // Fake reply — swap for your backend. The streaming → idle edge is what
  // auto-dispatches the next queued message through onSend.
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    },
    [],
  );
  const respond = (text: string) => {
    setStatus("streaming");
    replyTimerRef.current = setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          from: "assistant",
          text: `Replying to “${text}” — swap this stub for your backend.`,
          files: [],
        },
      ]);
      setStatus("idle");
    }, 2600);
  };

  // Float the composer over the transcript: measure it to reserve scroll
  // padding (plus the collapsed queue stack) and to position the stack, and
  // keep the transcript pinned to the latest message.
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
    // `queue` is a dep: enqueuing grows the reserved bottom padding,
    // which must re-pin the scroll too.
  }, [messages, inputH, queue]);

  // Double-click a queued card (or its ✎) to pull it back into the composer.
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

  // Height of the collapsed queue pile — reserved under the transcript
  // alongside the composer.
  const collapsedStackH = collapsedStackHeight(queue.length, cardH);

  return (
    <div
      className="relative w-full self-stretch"
      style={{ height: Math.max(inputH, 56) }}
    >
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto scrollbar-hide"
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
                className="max-w-[80%] self-start whitespace-pre-wrap break-words py-2 text-[14px] text-foreground"
              >
                {m.text}
              </div>
            ) : m.id === morphingId ? (
              // Mid-morph: shares a layoutId with the front stack card; the
              // inner span is layout-corrected so the text doesn't stretch.
              <motion.div
                key={m.id}
                layoutId={`qm-${m.id}`}
                layout
                initial={false}
                transition={spring.moderate}
                style={{ transformOrigin: "bottom right" }}
                className={`max-w-[80%] self-end whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] text-pretty bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] text-accent-foreground ${shape.bg}`}
              >
                <motion.span layout className="inline-block align-top">
                  {m.text}
                </motion.span>
              </motion.div>
            ) : (
              <div
                key={m.id}
                className="flex max-w-[80%] flex-col items-end gap-1.5 self-end"
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
                    className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] text-pretty bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] text-accent-foreground ${shape.bg}`}
                  >
                    {m.text}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {/* Queued messages — Sonner-style stack floated just above the
          composer (front card = next to dispatch). */}
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
        className="absolute inset-x-0 bottom-0"
        value={value}
        onValueChange={setValue}
        onSend={(text, sent, meta) => {
          if (text || sent.length) {
            if (text && !meta?.queuedId) onSubmitMessage?.(text);
            const id = meta?.queuedId ?? crypto.randomUUID();
            setMessages((m) => [...m, { id, from: "user", text, files: sent }]);
            if (demo) respond(text);
            // A dispatched (from-queue) text message morphs from its stack
            // card; attachment cards fade instead (their layouts differ).
            if (meta?.queuedId && sent.length === 0) {
              setMorphingId(meta.queuedId);
              if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
              morphTimerRef.current = setTimeout(
                () => setMorphingId(null),
                450,
              );
            }
          }
          // Only clear the composer for an actual user submit — a queued
          // dispatch must leave any in-progress draft untouched.
          if (!meta?.queuedId) {
            setValue("");
            setFiles([]);
          }
        }}
        placeholderSuggestion="Why is every other input box so stiff?"
        suggestions={SUGGESTIONS}
        // ArrowUp recalls sent messages, ArrowDown walks back to the draft.
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
          <DropdownMenu>
            <DropdownTrigger
              render={
<Button
                  variant="ghost"
                  size="sm"
                  trailingIcon={ChevronDownIcon}
                >
                  {qualityLabels[Math.min(Math.floor(displayQuality / 10000), 5)]}
                </Button>
              }
            />
            <DropdownContent>
              <Slider
                label="Quality"
                className="p-4"
                value={quality}
                onChange={(v) => setQuality(Array.isArray(v) ? v[0] : v)}
                onPointerUp={releaseQuality}
                min={0}
                max={50000}
                step={10000}
                formatValue={(v) =>
                  qualityLabels[Math.min(Math.floor(v / 10000), 5)] ??
                  `${v.toLocaleString()} tokens`
                }
              />
            </DropdownContent>
          </DropdownMenu>
        }
        // While streaming, submits enqueue; flipping back to idle
        // dispatches the head of the queue through onSend.
        status={status}
        disabled={disabled}
        queue={queue}
        onQueueChange={setQueue}
        onStop={() => {
          if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
          setStatus("idle");
        }}
        // The built-in queue rows are replaced by the stacked cards above.
        showQueue={false}
      />
    </div>
  );
}
