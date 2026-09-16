"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Children, cloneElement, isValidElement } from "react";

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
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => (
            <h1 className=" text-[16px] font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className=" text-[15px] font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className=" text-[14px] font-semibold">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className: cls, children }) => {
            const isBlock =
              typeof cls === "string" && cls.includes("language-");
            if (isBlock) {
              return (
                <code className={cn("block overflow-x-auto", cls)}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className={cn(
                  "rounded bg-muted px-1 py-0.5 text-[0.9em] wrap-break-word whitespace-pre-wrap",
                )}
                style={{ wordWrap: "break-word" }}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="rounded-lg bg-muted/60 p-3 text-muted-foreground">
              {children}
            </pre>
          ),
          // Markdown tables render through the app's Table component
          // (fluid hover rows, size ladder). Wide tables scroll horizontally
          // inside the Table instead of crushing their columns.
          table: ({ children }) => <Table>{children}</Table>,
          thead: ({ children }) => <TableHeader>{children}</TableHeader>,
          tbody: ({ children }) => (
            <TableBody>
              {Children.map(children, (child, index) =>
                isValidElement<{ index?: number }>(child)
                  ? cloneElement(child, { index })
                  : child,
              )}
            </TableBody>
          ),
          tr: ({ children }) => <TableRow>{children}</TableRow>,
          th: ({ children }) => <TableHead>{children}</TableHead>,
          td: ({ children }) => <TableCell>{children}</TableCell>,
          hr: () => <hr className=" border-border/60" />,
          strong: ({ children }) => (
            <strong className="font-medium">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
