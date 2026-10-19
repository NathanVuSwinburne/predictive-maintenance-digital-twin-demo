"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PageDetails = {
  title: string;
  description?: string;
};

const pageDetailsByPath: Record<string, PageDetails> = {
  "/monitor": {
    title: "Live Monitor",
    description: "Watch a connected machine's readings, prediction, and one-hour outlook as they arrive.",
  },
  "/dashboard": {
    title: "Dashboard",
    description: "Monitor fleet health, risk, and recent operational activity.",
  },
  "/machines": {
    title: "Machines",
    description: "Browse monitored machines and their current condition.",
  },
  "/mlops": {
    title: "Machine Registry",
    description:
      "Register machines, prepare their data, compare model runs, and manage active models.",
  },
  "/history": {
    title: "Operations History",
    description:
      "Browse telemetry anomalies, predictions, maintenance actions, simulations, and chat outcomes.",
  },
  "/chat": {
    title: "AI Assistant",
    description:
      "Investigate machine conditions, evidence, and next actions in plain language.",
  },
  "/knowledge": {
    title: "Knowledge",
    description: "Explore and maintain the system's operational knowledge.",
  },
  "/simulator": {
    title: "Simulator",
    description: "Run predictions and explore machine scenarios.",
  },
  "/account/security": {
    title: "Account Security",
    description: "Manage your authenticator app and recovery codes.",
  },
  "/admin": {
    title: "Administration",
    description: "Manage user roles, machine access, models, and integrations.",
  },
  "/admin/users": {
    title: "User Management",
    description: "Manage user roles and machine access.",
  },
  "/admin/machines": {
    title: "Machine Access",
    description: "Review and manage who can access each machine.",
  },
  "/admin/models": {
    title: "Machine Model Approvals",
    description: "Review candidate models and manage active versions.",
  },
  "/admin/managemqtt": {
    title: "Manage MQTT",
    description: "Configure MQTT sources and review connection health.",
  },
};

const segmentLabels: Record<string, string> = {
  admin: "Administration",
  account: "Account",
  machines: "Machines",
  monitor: "Live Monitor",
};

function titleCaseSegment(segment: string) {
  return decodeURIComponent(segment)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function pageDetailsFor(pathname: string): PageDetails {
  const exactMatch = pageDetailsByPath[pathname];
  if (exactMatch) return exactMatch;

  if (/^\/monitor\/[^/]+$/.test(pathname)) {
    return {
      title: "Machine Monitor",
      description: "Current readings, prediction, and one-hour outlook for this machine.",
    };
  }

  if (/^\/machines\/[^/]+$/.test(pathname)) {
    return {
      title: "Machine Details",
      description:
        "Review machine condition, sensor data, predictions, and maintenance activity.",
    };
  }

  const finalSegment =
    pathname.split("/").filter(Boolean).at(-1) ?? "dashboard";
  return { title: titleCaseSegment(finalSegment) };
}

function SidebarControl() {
  const { state } = useSidebar();
  const label = state === "expanded" ? "Collapse sidebar" : "Expand sidebar";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger aria-label={label} />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const segments = useMemo(
    () => pathname.split("/").filter(Boolean),
    [pathname],
  );
  const pageDetails = useMemo(() => pageDetailsFor(pathname), [pathname]);
  const isNestedRoute = segments.length > 1;

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-xs">
      <SidebarControl />

      <div className="flex min-w-0 flex-col gap-0.5">
        {isNestedRoute ? (
          <Breadcrumb>
            <BreadcrumbList>
              {segments.map((segment, index) => {
                const href = `/${segments.slice(0, index + 1).join("/")}`;
                const isLast = index === segments.length - 1;
                const label = isLast
                  ? pageDetails.title
                  : (segmentLabels[segment] ?? titleCaseSegment(segment));

                return (
                  <Fragment key={href}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={href}>{label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast ? <BreadcrumbSeparator /> : null}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}

        <h1 className="truncate text-base font-semibold text-foreground">
          {pageDetails.title}
        </h1>
        {pageDetails.description ? (
          <p className="truncate text-xs text-muted-foreground">
            {pageDetails.description}
          </p>
        ) : null}
      </div>
      <div className="ml-auto shrink-0">
        <ThemeToggle />
      </div>
    </header>
  );
}
