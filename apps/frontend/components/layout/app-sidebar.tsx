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
      <SidebarHeader>
        <div className="flex items-center gap-2 border border-sidebar-border p-2">
          <GearIcon />
          <div className="flex flex-col">
            <span className="text-xs font-semibold">
              Predictive Digital Twin
            </span>
            <span className="text-xs text-sidebar-foreground/70">v0.1.0</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
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
        <div className="flex items-center justify-between border border-sidebar-border p-2 text-xs">
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
          <CirclesThreePlusIcon />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
