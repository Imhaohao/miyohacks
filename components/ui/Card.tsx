import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  /** Reduces font size for headers nested inside other cards. */
  size?: "default" | "subtle";
}

export function CardHeader({
  title,
  meta,
  className,
  size = "default",
}: CardHeaderProps) {
  const titleClass =
    size === "subtle"
      ? "text-sm font-semibold tracking-tight text-ink"
      : "text-base font-semibold tracking-tight text-ink";
  return (
    <div
      className={cn("mb-4 flex items-center justify-between gap-3", className)}
    >
      <h3 className={titleClass}>{title}</h3>
      {meta !== undefined && (
        <div className="text-xs text-ink-muted">{meta}</div>
      )}
    </div>
  );
}
