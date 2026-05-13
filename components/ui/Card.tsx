import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover",
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
      className={cn(
        "mb-4 flex flex-col items-start justify-between gap-1.5 sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      <h3 className={cn("min-w-0", titleClass)}>{title}</h3>
      {meta !== undefined && (
        <div className="min-w-0 text-xs text-ink-muted">{meta}</div>
      )}
    </div>
  );
}
