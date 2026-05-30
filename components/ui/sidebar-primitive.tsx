"use client";

/**
 * Lean, dependency-free sidebar primitive — a faithful subset of the shadcn
 * `sidebar` block covering exactly the API the Arbor dashboard uses:
 * Provider / Sidebar / Header / Content / Footer / Group(+Label) / Menu(+Item,
 * +Button) / Inset / Trigger. Collapsible="icon" shrinks to an icon rail
 * (text is clipped, not unmounted, so `asChild` children need no edits).
 * Styled with the shadcn `--sidebar-*` tokens (see globals.css).
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarState = "expanded" | "collapsed";

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a <SidebarProvider>");
  }
  return ctx;
}

export function SidebarProvider({
  defaultOpen = true,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const toggleSidebar = React.useCallback(() => setOpen((o) => !o), []);
  const value = React.useMemo<SidebarContextValue>(
    () => ({ state: open ? "expanded" : "collapsed", open, setOpen, toggleSidebar }),
    [open, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        className={cn("flex min-h-svh w-full bg-background", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  collapsible = "icon",
  // `variant` is accepted for API parity with shadcn but not rendered here.
  variant: _variant,
  className,
  children,
  ...props
}: React.ComponentProps<"aside"> & {
  collapsible?: "icon" | "none";
  variant?: "sidebar" | "floating" | "inset";
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed" && collapsible === "icon";

  return (
    <aside
      data-slot="sidebar"
      data-state={state}
      data-collapsible={collapsible}
      className={cn(
        "group/sidebar hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out md:flex",
        collapsed ? "w-[3.5rem]" : "w-64",
        className,
      )}
      {...props}
    >
      <div
        data-slot="sidebar-inner"
        className="flex h-svh min-h-0 flex-col"
      >
        {children}
      </div>
    </aside>
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full flex-col p-2", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "flex h-8 shrink-0 items-center px-2 text-xs font-medium text-sidebar-foreground/60 transition-opacity group-data-[state=collapsed]/sidebar:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  size = "default",
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  size?: "default" | "sm" | "lg";
  tooltip?: string;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      title={tooltip}
      className={cn(
        "flex w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-2 text-left text-sm outline-none transition-colors",
        "[&>svg]:size-4 [&>svg]:shrink-0",
        // Collapsed icon rail: center the icon and hide the label text.
        "group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:[&>a>span]:hidden group-data-[state=collapsed]/sidebar:[&>span:last-child]:hidden",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" ? "h-7" : size === "lg" ? "h-12" : "h-8",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      <PanelLeft className="size-4" />
    </button>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative flex min-h-svh flex-1 flex-col", className)}
      {...props}
    />
  );
}
