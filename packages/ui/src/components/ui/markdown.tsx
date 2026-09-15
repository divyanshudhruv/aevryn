"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@aevryn/ui/components/ui/table";
import { cn } from "@aevryn/ui/lib/utils";

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn("markdown-body min-w-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-foreground underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          p: ({ children }) => (
            <p className=" first:mt-0 last:mb-0 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className=" list-disc space-y-1 pl-5 first:mt-0 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className=" list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => (
            <h1 className=" text-[16px] font-semibold first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className=" text-[15px] font-semibold first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className=" text-[14px] font-semibold first:mt-0">
              {children}
            </h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="m border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className: cls, children }) => {
            const isBlock = typeof cls === "string" && cls.includes("language-");
            if (isBlock) {
              return (
                <code className={cn("block overflow-x-auto", cls)}>{children}</code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className=" overflow-x-auto rounded-lg bg-muted/60 p-3 text-[12px] leading-relaxed">
              {children}
            </pre>
          ),
          // Markdown tables render through the app's Table component
          // (fluid hover rows, size ladder) — rows get an index for hover.
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <Table>{children}</Table>
            </div>
          ),
          thead: ({ children }) => <TableHeader>{children}</TableHeader>,
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => <TableRow>{children}</TableRow>,
          th: ({ children }) => (
            <TableHead>{children}</TableHead>
          ),
          td: ({ children }) => (
            <TableCell>{children}</TableCell>
          ),
          hr: () => <hr className=" border-border/60" />,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
