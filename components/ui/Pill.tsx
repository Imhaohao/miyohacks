import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export type PillTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONES: Record<PillTone, string> = {
  neutral: "bg-surface-muted text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-700",
};

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  pulse?: boolean;
}

export function Pill({
  className,
  tone = "neutral",
  pulse = false,
  ...props
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight",
        TONES[tone],
        pulse && "animate-soft-pulse",
        className,
      )}
      {...props}
    />
  );
}
