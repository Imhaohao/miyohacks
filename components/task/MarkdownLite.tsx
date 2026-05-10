"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

const COMPONENTS: Components = {
  h1: ({ children, ...props }) => (
    <h1
      className="mt-2 text-xl font-semibold tracking-tight text-ink first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="mt-5 text-base font-semibold tracking-tight text-ink first:mt-0"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="mt-4 text-sm font-semibold tracking-tight text-ink first:mt-0"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      className="mt-3 text-sm font-semibold tracking-tight text-ink-soft first:mt-0"
      {...props}
    >
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => (
    <p className="leading-relaxed text-ink-soft" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-ink" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }) => (
    <ul className="ml-5 list-disc space-y-1.5 text-ink-soft" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="ml-5 list-decimal space-y-1.5 marker:font-mono marker:text-ink-muted text-ink-soft"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed [&>p]:m-0" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-brand-700 underline-offset-2 hover:underline"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-line pl-3 italic text-ink-muted"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: (props) => <hr className="my-4 border-line" {...props} />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={cn("font-mono text-xs", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="overflow-x-auto rounded-xl bg-surface-muted p-3 text-ink-soft"
      {...props}
    >
      {children}
    </pre>
  ),
};

export function MarkdownLite({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      <ReactMarkdown components={COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}
