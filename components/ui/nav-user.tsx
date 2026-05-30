"use client";

import { CaretUpDown } from "@phosphor-icons/react";

interface NavUserProps {
  name?: string;
  org?: string;
  initials?: string;
}

/**
 * Footer identity chip for the dashboard sidebar. Mirrors the account chip in
 * the marketing nav (Jamie Sole · Stackform). Collapses to just the avatar
 * when the sidebar is in its icon rail (overflow clips the text).
 */
export function NavUser({
  name = "Jamie Sole",
  org = "Stackform",
  initials = "JS",
}: NavUserProps) {
  return (
    <div className="p-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 overflow-hidden rounded-md p-1.5 text-left transition-colors hover:bg-sidebar-accent"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight group-data-[state=collapsed]/sidebar:hidden">
          <span className="truncate text-sm font-medium text-sidebar-foreground">
            {name}
          </span>
          <span className="truncate text-[11px] text-sidebar-foreground/60">
            {org}
          </span>
        </span>
        <CaretUpDown
          size={14}
          weight="bold"
          className="shrink-0 text-sidebar-foreground/50 group-data-[state=collapsed]/sidebar:hidden"
        />
      </button>
    </div>
  );
}

export default NavUser;
