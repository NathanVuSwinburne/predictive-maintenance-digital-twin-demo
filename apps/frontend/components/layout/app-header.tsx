"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SignOutIcon } from "@phosphor-icons/react";

import { useAuth } from "@/components/auth/auth-context";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";

const pageLabelMap: Record<string, string> = {
  dashboard: "Dashboard",
  machines: "Machines",
  history: "Historical Data",
  chat: "AI Assistant",
  simulator: "Simulator",
  admin: "Admin",
  account: "Account",
  security: "Security",
  users: "Users",
  login: "Login",
};

function buildBreadcrumb(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return ["dashboard"];
  }

  return segments;
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const breadcrumbs = useMemo(() => buildBreadcrumb(pathname), [pathname]);

  async function onLogout() {
    try {
      await logout();
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to log out");
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xs">
      <SidebarTrigger />

      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((segment, index) => {
            const href = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
            const label = pageLabelMap[segment] ?? segment.toUpperCase();
            const isLast = index === breadcrumbs.length - 1;

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
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void onLogout()}>
          <SignOutIcon data-icon="inline-start" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
