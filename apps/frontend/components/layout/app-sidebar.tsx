"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CaretUpDownIcon,
  ChatCircleDotsIcon,
  ClockCounterClockwiseIcon,
  CpuIcon,
  DatabaseIcon,
  GaugeIcon,
  GearIcon,
  GraphIcon,
  HouseIcon,
  PulseIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SpinnerIcon,
  UserGearIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { useSimulationRunStatus } from "@/components/simulator/simulation-run-status-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";

type NavigationItem = {
  href: string;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Operational",
    items: [
      { href: "/monitor", label: "Live Monitor", icon: PulseIcon },
      { href: "/dashboard", label: "Dashboard", icon: HouseIcon },
      { href: "/machines", label: "Machines", icon: CpuIcon },
      { href: "/history", label: "History", icon: ClockCounterClockwiseIcon },
      { href: "/simulator", label: "Simulator", icon: GaugeIcon },
      { href: "/chat", label: "AI Assistant", icon: ChatCircleDotsIcon },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/mlops", label: "Machine Registry", icon: DatabaseIcon },
      { href: "/knowledge", label: "Knowledge", icon: GraphIcon },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin",
        label: "Admin",
        icon: UserGearIcon,
        adminOnly: true,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activePersona, logout } = useAuth();
  const simulationStatus = useSimulationRunStatus();
  const [logoutError, setLogoutError] = useState<UserFacingError | null>(null);
  const initials = (activePersona?.name ?? "User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function onLogout() {
    setLogoutError(null);
    try {
      await logout();
      router.push("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(toUserFacingError(error, "auth.logout"));
    }
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:px-2">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
            <GearIcon aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-xs font-semibold">
              Predictive Digital Twin
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              Operations workspace
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator className="mx-3 group-data-[collapsible=icon]:mx-2" />

      <SidebarContent>
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || activePersona?.role === "admin",
          );

          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
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
                          className="border-l-2 border-transparent data-[active=true]:border-sidebar-primary"
                        >
                          <Link href={item.href}>
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                            {item.href === "/simulator" &&
                              simulationStatus.status === "running" && (
                                <SidebarMenuBadge>
                                  <SpinnerIcon
                                    className="animate-spin"
                                    aria-hidden="true"
                                  />
                                  <span className="sr-only">
                                    Simulation running
                                  </span>
                                </SidebarMenuBadge>
                              )}
                            {item.href === "/simulator" &&
                              simulationStatus.hasUnviewedCompletedRun && (
                                <SidebarMenuBadge>Done</SidebarMenuBadge>
                              )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Account menu"
                  aria-label="Account menu"
                >
                  <Avatar size="sm">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate font-medium">
                      {activePersona?.name ?? "No User"}
                    </span>
                    <span className="truncate text-sidebar-foreground/60 capitalize">
                      {activePersona?.role ?? "guest"}
                    </span>
                  </span>
                  <CaretUpDownIcon aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
              >
                <DropdownMenuLabel>
                  <span className="block truncate font-medium">
                    {activePersona?.name ?? "No User"}
                  </span>
                  <span className="block truncate font-normal text-muted-foreground">
                    {activePersona?.email ?? "No account email"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/account/security">
                      <ShieldCheckIcon aria-hidden="true" />
                      Account Security
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void onLogout();
                    }}
                  >
                    <SignOutIcon aria-hidden="true" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {logoutError ? (
                  <ErrorNotice error={logoutError} className="m-1 mt-2" />
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
