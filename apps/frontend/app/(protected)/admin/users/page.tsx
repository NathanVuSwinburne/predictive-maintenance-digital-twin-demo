"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { UserAccessDialog } from "@/components/admin/user-access-dialog";
import { useAuth } from "@/components/auth/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDataProvider } from "@/hooks/use-data-provider";
import type { MachineSummary, UserPersona, UserRole } from "@/lib/domain/types";

type UserAccessMap = Record<string, string[]>;

export default function AdminUsersPage() {
  const provider = useDataProvider();
  const router = useRouter();
  const { activePersona, refreshUsers } = useAuth();

  const [users, setUsers] = useState<UserPersona[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [machineIdsByUserId, setMachineIdsByUserId] = useState<UserAccessMap>(
    {},
  );
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [loadedUsers, loadedMachines] = await Promise.all([
        provider.listUsers(),
        provider.listMachines({ sortBy: "name", sortDirection: "asc" }),
      ]);
      const accessEntries = await Promise.all(
        loadedUsers.map(
          async (user) =>
            [user.id, await provider.getUserMachineAccess(user.id)] as const,
        ),
      );

      setUsers(loadedUsers);
      setMachines(loadedMachines);
      setMachineIdsByUserId(Object.fromEntries(accessEntries));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load users";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        [user.name, user.email, user.role]
          .join(" ")
          .toLowerCase()
          .includes(term);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [roleFilter, search, users]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) {
      return null;
    }

    const user = users.find((candidate) => candidate.id === selectedUserId);

    if (!user) {
      return null;
    }

    return {
      ...user,
      machineIds: machineIdsByUserId[user.id] ?? [],
    };
  }, [machineIdsByUserId, selectedUserId, users]);

  async function handleSaveUser(input: {
    userId: string;
    role: UserRole;
    machineIds: string[];
  }) {
    const currentUser = users.find((user) => user.id === input.userId);

    if (!currentUser) {
      return;
    }

    setIsSaving(true);

    try {
      if (currentUser.role !== input.role) {
        await provider.updateUserRole(input.userId, input.role);
      }

      const currentMachineIds = machineIdsByUserId[input.userId] ?? [];
      const hasAccessChanges =
        currentMachineIds.length !== input.machineIds.length ||
        currentMachineIds.some(
          (machineId) => !input.machineIds.includes(machineId),
        );

      if (hasAccessChanges) {
        await provider.updateUserMachineAccess(input.userId, input.machineIds);
      }

      await Promise.all([loadData(), refreshUsers()]);
      toast.success("User access updated");
      setIsDialogOpen(false);

      if (activePersona?.id === input.userId && input.role !== "admin") {
        router.push("/dashboard");
      }

      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save user access",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">User management</CardTitle>
          <CardDescription className="text-sm">
            Search users, inspect their role, and manage the machines they can
            access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search users"
                placeholder="Search by name, email, or role"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>

            <Select
              value={roleFilter}
              onValueChange={(value) =>
                setRoleFilter(value as UserRole | "all")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">Standard user</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {loadError && (
            <Alert variant="destructive">
              <MagnifyingGlassIcon />
              <AlertTitle>Unable to load admin data</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Authorised machines</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 4 }, (_, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-36" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-7 w-20" />
                        </TableCell>
                      </TableRow>
                    ))
                  : filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-muted-foreground">
                              {user.shift}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.role === "admin" ? "default" : "secondary"
                            }
                          >
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {machineIdsByUserId[user.id]?.length ?? 0}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setIsDialogOpen(true);
                            }}
                          >
                            Manage access
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>

          {!isLoading && filteredUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No users match the current filters.
            </p>
          )}
        </CardContent>
      </Card>

      <UserAccessDialog
        isOpen={isDialogOpen}
        isSaving={isSaving}
        machines={machines}
        user={selectedUser}
        onOpenChange={(open) => {
          setIsDialogOpen(open);

          if (!open) {
            setSelectedUserId(null);
          }
        }}
        onSave={handleSaveUser}
      />
    </div>
  );
}
