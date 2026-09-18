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
						<ul className="list-disc space-y-0.5 pl-1 marker:text-muted-foreground/70">
							{children}
						</ul>
					),
					ol: ({ children }) => (
						<ol className="list-decimal space-y-0.5 pl-1 marker:text-muted-foreground/70">
							{children}
						</ol>
					),
					li: ({ children }) => <li className="">{children}</li>,
					h1: ({ children }) => (
						<h1 className="font-normal text-[20px]">
							{/* <span className="mr-1 select-none text-muted-foreground/70">
                #
              </span> */}
							{children}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className="font-medium text-[18px]">
							{/* <span className="mr-1 select-none text-muted-foreground/70"></span> */}
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className="font-normal text-[16px]">
							{/* <span className="mr-1 select-none text-muted-foreground/70">
                #
              </span> */}
							{children}
						</h3>
					),
					h4: ({ children }) => (
						<h4 className="font-normal text-[14px]">
							{/* <span className="mr-1 select-none text-muted-foreground/70">
                #
              </span> */}
							{children}
						</h4>
					),
					h5: ({ children }) => (
						<h5 className="font-normal text-[12px]">
							{/* <span className="mr-1 select-none text-muted-foreground/70">
                #
              </span> */}
							{children}
						</h5>
					),
					h6: ({ children }) => (
						<h6 className="font-normal text-[12px]">
							{/* <span className="mr-1 select-none text-muted-foreground/70">
                #
              </span> */}
							{children}
						</h6>
					),
					blockquote: ({ children }) => (
						<blockquote className="border-border border-l-2 pl-3 text-muted-foreground">
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
									"wrap-break-word whitespace-pre-wrap rounded bg-muted px-1 py-0.5 text-[0.9em]",
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
					hr: () => <hr className="border-border/60" />,
					strong: ({ children }) => (
						<strong className="font-normal">{children}</strong>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}

export default Markdown;
