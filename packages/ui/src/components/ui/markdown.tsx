"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@aevryn/ui/components/ui/table";
import { cn } from "@aevryn/ui/lib/utils";
import { Children, cloneElement, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
	content: string;
	className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
	return (
		<div className={cn("markdown-body min-w-0 leading-[21px]", className)}>
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
					p: ({ children }) => <p className="my-1.5">{children}</p>,
					ul: ({ children }) => (
						<ul className="list-outside list-disc space-y-1 pl-6 marker:text-muted-foreground/70">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="list-outside list-decimal space-y-1 pl-6 marker:text-muted-foreground/70">
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li
							className={cn(
								"my-0.5",
								// Nested lists inside an li: breathe and indent relative
								// to the li's own text, not the parent list's padding.
								"[&>ol]:mt-1 [&>ol]:mb-1 [&>ol]:pl-4",
								"[&>p]:my-0 [&>ul]:mt-1 [&>ul]:mb-1 [&>ul]:pl-4",
							)}
						>
							{children}
						</li>
					),
					h1: ({ children }) => (
						<h1 className="mt-5 mb-2 font-normal text-[20px] first:mt-0">
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="mt-5 mb-2 font-medium text-[18px] first:mt-0">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="mt-4 mb-1.5 font-normal text-[16px] first:mt-0">
							{children}
						</h3>
					),
					h4: ({ children }) => (
						<h4 className="mt-3 mb-1.5 font-normal text-[14px] first:mt-0">
							{children}
						</h4>
					),
					h5: ({ children }) => (
						<h5 className="mt-3 mb-1 font-normal text-[12px] first:mt-0">
							{children}
						</h5>
					),
					h6: ({ children }) => (
						<h6 className="mt-3 mb-1 font-normal text-[12px] first:mt-0">
							{children}
						</h6>
					),
					blockquote: ({ children }) => (
						<blockquote className="my-2 border-border border-l-2 pl-3 text-muted-foreground">
							{children}
						</blockquote>
					),
					code: ({ className: cls, children }) => {
						const isBlock =
							typeof cls === "string" && cls.includes("language-");
						if (isBlock) {
							// Inside <pre>: reset the inline-code chrome so block code
							// doesn't render muted-bg-in-muted-bg with doubled padding.
							return (
								<code
									className={cn(
										"block overflow-x-auto bg-transparent p-0 text-inherit",
										cls,
									)}
								>
									{children}
								</code>
							);
						}
						return (
							<code
								className={cn(
									"wrap-break-word whitespace-pre-wrap rounded bg-muted px-1 py-0.5 text-[13px]",
								)}
								style={{ wordWrap: "break-word" }}
							>
								{children}
							</code>
						);
					},
					pre: ({ children }) => (
						<pre className="my-2 rounded-lg bg-muted/60 p-3 text-muted-foreground">
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
					hr: () => <hr className="my-4 border-border/60" />,
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
