import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

/**
 * Small label that sits above a heading. Sentence case — never uppercase.
 */
export function Eyebrow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "text-xs font-medium text-brand-700",
        className,
      )}
      {...props}
    />
  );
}
