"use client";

import { ChatComposer } from "@aevryn/ui/components/chat-composer";
import { AppSidebar } from "@aevryn/ui/components/sidebar-preset/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@aevryn/ui/components/ui/sidebar";
import { ChatMessage } from "@aevryn/ui/components/ui/chat-message";

import { CopyIcon, RotateCcwIcon, PlayIcon } from "lucide-react";
import { SearchableDropdown } from "@aevryn/ui/components/header/searchable-dropdown";
import InputGroup, { InputField } from "@aevryn/ui/components/ui/input-group";
import { Button } from "@aevryn/ui/components/ui/button";
import { Switch } from "@aevryn/ui/components/ui/switch";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { QuestionFlow } from "@aevryn/ui/components/question-flow";
import {
  AccordionGroup,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@aevryn/ui/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aevryn/ui/components/ui/table";
import { ThinkingIndicator } from "@aevryn/ui/components/ui/thinking-indicator";
import {
  ResearchAgent,
  WebScrapeAgent,
  CompilingAgent,
  FinalAnswerStep,
} from "@/components/workspace/tool-step-calls";
import { SystemMessage } from "@aevryn/ui/components/ui/system-message";

export default function WorkspacePage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : false;

  const items = [
    {
      value: "item-1",
      title: "Item 1",
      content: "Content 1",
    },
    {
      value: "item-2",
      title: "Item 2",
      content: "Content 2",
    },
    {
      value: "item-3",
      title: "Item 3",
      content: "Content 3",
    },
  ];
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex h-full min-h-0 flex-col">
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
                    value={
                      "Compare prices of Framework Laptop 16 and Apple Macbook"
                    }
                    onChange={() => {}}
                  />
                </InputGroup>
              </div>

              <div className="flex flex-row items-center gap-2">
                <Button variant="ghost">Run</Button>

                <Button>More</Button>
                {/* More will open a dialog similar to settigns dialog with sidebar, but More will contain 2 button, one for share, and one for prompts and instructions, all the questions asked and answered by user earlier can be edited there + veen more can be added */}
                <Switch
                  label=""
                  checked={isDark}
                  onToggle={() => setTheme(isDark ? "light" : "dark")}
                />
              </div>
            </div>
          </header>

          <section
            aria-label="Conversation"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex min-h-full max-w-3xl flex-col">
              <div className="flex-1 p-4">
                <div className="flex flex-col gap-2">
                  <ChatMessage
                    from="user"
                    time="Wednesday 6:06 PM"
                    actions={actions}
                  >
                    Hi who are you an what can you do
                  </ChatMessage>
                  <ChatMessage
                    from="assistant"
                    actions={actions}
                    time="Wednesday 6:06 PM"
                  >
                    Good design. I am Aevryn, your AI assistant. I can help you
                    with a variety of tasks, including answering questions,
                    helping you with your work, and more.
                  </ChatMessage>
                  <ChatMessage
                    from="user"
                    time="Wednesday 6:07 PM"
                    actions={actions}
                  >
                    What all tools, do you have?
                  </ChatMessage>
                  <ChatMessage
                    from="assistant"
                    actions={actions}
                    time="Wednesday 6:07 PM"
                  >
                    <div className="w-full flex flex-col gap-5">
                      <p>
                        I have a variety of tools at my disposal, including web
                        search, file reading, and more. I can help you with a
                        variety of tasks, including answering questions, helping
                        you with your work, and more.
                      </p>
                      <div className="flex flex-col gap-1">
                        <ResearchAgent />{" "}
                      </div>
                    </div>
                  </ChatMessage>
                  <ChatMessage
                    from="user"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    Okay, I want to create a workflow for this thread in which
                    you will find the best options for me.
                  </ChatMessage>
                  <ChatMessage
                    from="assistant"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    {/* the questions flow has a definite schema, and llm can create the working, ask questions for clarifications, and it has a input too, so user cnainput its own too */}
                    <div className="w-full flex flex-col gap-5">
                      <QuestionFlow className="w-full flex flex-col" />
                      <p>
                        Sure, can you mind filling in the details so that I can
                        verify and create the exact cuztomizable workflow?
                      </p>
                    </div>
                  </ChatMessage>
                  {/* filled, clicked submit, and a copy of the resposnse is formatted (simple text) and sent in the chat. */}
                  <SystemMessage fill={true} className="mb-[40px]">
                    <p>Questions filled and submitted</p>
                  </SystemMessage>

                  <ChatMessage
                    from="assistant"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    <div className="w-full flex flex-col gap-5">
                      <p>
                        Okay, I will bind the workflow soon with this thread,
                        and here's the final view of the workflow addition for
                        you.
                      </p>
                      {/* the according will contain the plan selected by llm and user so that user can review it */}
                      <AccordionGroup
                        type="single"
                        className="w-fill"
                        collapsible
                        defaultValue="item-1"
                      >
                        {items.map((item, i) => (
                          <AccordionItem
                            key={item.value}
                            value={item.value}
                            index={i}
                          >
                            <AccordionTrigger>{item.title}</AccordionTrigger>
                            <AccordionContent>{item.content}</AccordionContent>
                          </AccordionItem>
                        ))}
                      </AccordionGroup>
                    </div>
                  </ChatMessage>
                  <ChatMessage
                    from="user"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    Sure, looks good, you can run it.
                  </ChatMessage>
                  <ChatMessage
                    from="assistant"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    {" "}
                    <div className="w-full flex flex-col gap-5">
                      <p>Running the workflow</p>
                      <div className="flex flex-col gap-1">
                        <ResearchAgent />{" "}
                        <SystemMessage variant="error" fill={true}>
                          <p>Error: Failed to call tools</p>
                        </SystemMessage>
                        <SystemMessage variant="warning" fill={true}>
                          <p>Retrying event id eve_49X94009cur9</p>
                        </SystemMessage>
                        <WebScrapeAgent />
                        <CompilingAgent />
                        <FinalAnswerStep />
                      </div>{" "}
                      <p>
                        Based on the research, it seems like the Framework
                        Laptop 16 is a great choice. It has a good balance of
                        performance and affordability, and its repairability is
                        a great plus.
                      </p>
                      <FinalAnswerStep />
                      {/* the above tool call is a call for sleep mode (for until next cron job) */}
                    </div>
                  </ChatMessage>
                  <ChatMessage
                    from="user"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    Thanks! Lastly, can you tell me the difference between these
                    2 laptops and it's specifications, probably in a table
                    format?
                  </ChatMessage>
                  {/* thinking step, then hide it onc'e llm returns the steps to be done or anything */}
                  <ChatMessage from="assistant">
                    <ThinkingIndicator />
                  </ChatMessage>
                  <ChatMessage
                    from="assistant"
                    time="Wednesday 6:08 PM"
                    actions={actions}
                  >
                    <div className="w-full flex flex-col gap-5">
                      <p>Here you go, your table</p>
                      <Table className="min-w-100">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow index={0}>
                            <TableCell>Alice</TableCell>
                            <TableCell>Engineer</TableCell>
                            <TableCell>Active</TableCell>
                          </TableRow>
                          <TableRow index={1}>
                            <TableCell>Bob</TableCell>
                            <TableCell>Designer</TableCell>
                            <TableCell>Away</TableCell>
                          </TableRow>
                          <TableRow index={2}>
                            <TableCell>Carol</TableCell>
                            <TableCell>Manager</TableCell>
                            <TableCell>Active</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </ChatMessage>
                </div>
              </div>
            </div>
          </section>

          <footer className="shrink-0  p-3">
            <div className="mx-auto max-w-3xl">
              <ChatComposer />
            </div>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

const actions = (
  <>
    <button
      aria-label="Copy"
      className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
    >
      <CopyIcon size={13} strokeWidth={1.5} />
    </button>
    <button
      aria-label="Regenerate"
      className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
    >
      <RotateCcwIcon size={13} strokeWidth={1.5} />
    </button>
  </>
);
