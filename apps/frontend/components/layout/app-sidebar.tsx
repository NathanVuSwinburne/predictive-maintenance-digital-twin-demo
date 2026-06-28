"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatCircleDotsIcon,
  CirclesThreePlusIcon,
  ClockCounterClockwiseIcon,
  CpuIcon,
  GearIcon,
  GaugeIcon,
  HouseIcon,
  SpinnerIcon,
  ShieldCheckIcon,
  UserGearIcon,
} from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import { useSimulationRunStatus } from "@/components/simulator/simulation-run-status-context";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: HouseIcon },
  { href: "/machines", label: "Machines", icon: CpuIcon },
  { href: "/history", label: "History", icon: ClockCounterClockwiseIcon },
  { href: "/chat", label: "AI Assistant", icon: ChatCircleDotsIcon },
  { href: "/simulator", label: "Simulator", icon: GaugeIcon },
  {
    href: "/account/security",
    label: "Account Security",
    icon: ShieldCheckIcon,
  },
  { href: "/admin", label: "Admin", icon: UserGearIcon, adminOnly: true },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { activePersona } = useAuth();
  const simulationStatus = useSimulationRunStatus();
  const visibleNavigation = navigation.filter(
    (item) => !item.adminOnly || activePersona?.role === "admin",
  );

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/35 p-2.5 shadow-sm">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <GearIcon className="size-5" weight="duotone" />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="display-mark truncate text-[13px] font-semibold">
              Predictive Twin
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-[0.12em] text-[var(--status-healthy)]">
              <span className="status-dot size-1.5" /> SYSTEM ONLINE
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup className="px-3 py-4">
          <div className="instrument-label mb-2 px-2 group-data-[collapsible=icon]:hidden">Operations</div>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavigation.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                        {item.href === "/simulator" &&
                          simulationStatus.status === "running" && (
                            <Badge
                              variant="secondary"
                              className="ml-auto gap-1 px-1.5 text-[10px]"
                            >
                              <SpinnerIcon className="animate-spin" />
                              Running
                            </Badge>
                          )}
                        {item.href === "/simulator" &&
                          simulationStatus.hasUnviewedCompletedRun && (
                            <Badge
                              variant="default"
                              className="ml-auto px-1.5 text-[10px]"
                            >
                              Done
                            </Badge>
                          )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between rounded-xl border border-sidebar-border/80 bg-sidebar-accent/30 p-2.5 text-xs shadow-sm">
          <div className="flex flex-col">
            <span className="font-medium">
              {activePersona?.name ?? "No User"}
            </span>
            <Badge
              variant={
                activePersona?.role === "admin" ? "default" : "secondary"
              }
            >
              {activePersona?.role ?? "guest"}
            </Badge>
          </div>
          <CirclesThreePlusIcon className="text-sidebar-foreground/45" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
