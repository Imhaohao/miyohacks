"use client";

import {
  LayoutGridIcon,
  ListChecksIcon,
  UsersIcon,
  GavelIcon,
  CoinsIcon,
  BarChart3Icon,
  SettingsIcon,
  SendIcon,
  HelpCircleIcon,
  BookOpenIcon,
} from "lucide-react";
import { ArborMark } from "@/components/ui/ArborMark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar-primitive";
import { NavUser } from "@/components/ui/nav-user";

type SidebarNavItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  isActive?: boolean;
};

type SidebarNavGroup = {
  label?: string;
  items: SidebarNavItem[];
};

const navGroups: SidebarNavGroup[] = [
  {
    label: "Marketplace",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: <LayoutGridIcon />, isActive: true },
      { title: "Tasks", url: "/", icon: <ListChecksIcon /> },
      { title: "Specialists", url: "/agents", icon: <UsersIcon /> },
      { title: "Auctions", url: "/dashboard", icon: <GavelIcon /> },
      { title: "Credits", url: "/dashboard", icon: <CoinsIcon /> },
      { title: "Analytics", url: "/dashboard", icon: <BarChart3Icon /> },
    ],
  },
  {
    label: "Administration",
    items: [{ title: "Settings", url: "/dashboard", icon: <SettingsIcon /> }],
  },
];

const footerNavLinks: SidebarNavItem[] = [
  { title: "Feedback", url: "#", icon: <SendIcon /> },
  { title: "Help Center", url: "#", icon: <HelpCircleIcon /> },
  { title: "Documentation", url: "#", icon: <BookOpenIcon /> },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="relative h-14 justify-center px-2 py-0">
        <div className="flex h-10 items-center rounded-lg px-2 group-data-[state=collapsed]/sidebar:[&_.font-display]:hidden">
          <ArborMark as="link" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={`sidebar-group-${index}`}>
            {group.label && (
              <SidebarGroupLabel className="font-normal">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.isActive}
                    tooltip={item.title}
                  >
                    <a href={item.url}>
                      {item.icon}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-0 p-0">
        <SidebarMenu className="border-t border-sidebar-border p-2">
          {footerNavLinks.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className="text-sidebar-foreground/70"
                size="sm"
              >
                <a href={item.url}>
                  {item.icon}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
