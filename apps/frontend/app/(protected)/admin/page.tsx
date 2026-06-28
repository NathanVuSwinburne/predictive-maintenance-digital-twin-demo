"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CpuIcon,
  ShieldCheckIcon,
  UsersIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataProvider } from "@/hooks/use-data-provider";
import type { MachineSummary, UserPersona } from "@/lib/domain/types";

export default function AdminOverviewPage() {
  const provider = useDataProvider();

  const [users, setUsers] = useState<UserPersona[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      setIsLoading(true);

      try {
        const [loadedUsers, loadedMachines] = await Promise.all([
          provider.listUsers(),
          provider.listMachines({ sortBy: "name", sortDirection: "asc" }),
        ]);

        if (!active) {
          return;
        }

        setUsers(loadedUsers);
        setMachines(loadedMachines);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load admin overview",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      active = false;
    };
  }, [provider]);

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users],
  );
  const standardUserCount = users.length - adminCount;

  const stats = [
    {
      label: "Total users",
      value: users.length,
      detail: "Accounts available",
      icon: UsersIcon,
    },
    {
      label: "Total machines",
      value: machines.length,
      detail: "Machines available to administrators",
      icon: CpuIcon,
    },
    {
      label: "Admins",
      value: adminCount,
      detail: "Users with full management access",
      icon: ShieldCheckIcon,
    },
    {
      label: "Standard users",
      value: standardUserCount,
      detail: "Users limited to assigned machines",
      icon: UserIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-sm">
                {stat.label}
              </CardDescription>
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardTitle className="text-lg">{stat.value}</CardTitle>
              )}
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <stat.icon />
              {stat.detail}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Manage users</CardTitle>
            <CardDescription className="text-sm">
              Review user roles and assign machine access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/users">Open user management</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Inspect machine assignments
            </CardTitle>
            <CardDescription className="text-sm">
              View users assigned to each machine.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/machines">Open machine view</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
