import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

type CardAccent = "none" | "brand" | "spectrum" | "warm";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Adds a thin gradient stripe at the top of the card. Cheap way to give the
   * surface a sense of identity without heavy chrome.
   */
  accent?: CardAccent;
}

const ACCENT_BG: Record<CardAccent, string> = {
  none: "",
  brand: "bg-gradient-to-r from-brand-500 via-brand-400 to-brand-600",
  spectrum:
    "bg-gradient-to-r from-brand-500 via-fuchsia-400 to-amber-400",
  warm: "bg-gradient-to-r from-amber-400 via-rose-400 to-fuchsia-500",
};

export function Card({
  className,
  accent = "none",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover",
        className,
      )}
      {...props}
    >
      {accent !== "none" && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-[3px]",
            ACCENT_BG[accent],
          )}
        />
      )}
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  /** Visual emphasis on the header — `subtle` reduces font size for nested cards. */
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
        "mb-4 flex items-center justify-between gap-3",
        className,
      )}
    >
      <h3 className={titleClass}>{title}</h3>
      {meta !== undefined && (
        <div className="text-xs text-ink-muted">{meta}</div>
      )}
    </div>
  );
}
