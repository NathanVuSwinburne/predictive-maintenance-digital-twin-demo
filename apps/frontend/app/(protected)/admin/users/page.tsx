"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { UserAccessDialog } from "@/components/admin/user-access-dialog";
import { UserInviteDialog } from "@/components/admin/user-invite-dialog";
import { InvitationManagement } from "@/components/admin/invitation-management";
import { useAuth } from "@/components/auth/auth-context";
import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
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
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";

type UserAccessMap = Record<string, string[]>;
type UserStatus = NonNullable<UserPersona["status"]>;
type PendingStatusChange = { user: UserPersona; status: UserStatus };

function statusChangeCopy(change: PendingStatusChange) {
  if (change.status === "active") {
    return {
      title: "Reactivate user?",
      description: `${change.user.name} will be able to sign in again.`,
      action: "Reactivate",
      success: "User reactivated",
      destructive: false,
    };
  }
  if (change.status === "suspended") {
    return {
      title: "Suspend user?",
      description: `${change.user.name} will be signed out immediately and unable to sign in until reactivated.`,
      action: "Suspend user",
      success: "User suspended",
      destructive: true,
    };
  }
  return {
    title: "Deactivate user?",
    description: `${change.user.name} will be signed out immediately and unable to sign in. Use deactivation when access is intended to end permanently.`,
    action: "Deactivate user",
    success: "User deactivated",
    destructive: true,
  };
}

export default function AdminUsersPage() {
  const provider = useDataProvider();
  const router = useRouter();
  const { refreshUsers } = useAuth();

  const [users, setUsers] = useState<UserPersona[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [machineIdsByUserId, setMachineIdsByUserId] = useState<UserAccessMap>(
    {},
  );
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitationRefreshKey, setInvitationRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [saveError, setSaveError] = useState<UserFacingError | null>(null);
  const [statusError, setStatusError] = useState<UserFacingError | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);

  async function applyStatusChange() {
    if (!pendingStatusChange) return;
    setIsSaving(true);
    setStatusError(null);
    try {
      await provider.updateUserStatus(pendingStatusChange.user.id, pendingStatusChange.status);
      await Promise.all([loadData(), refreshUsers()]);
      toast.success(statusChangeCopy(pendingStatusChange).success);
      setPendingStatusChange(null);
    } catch (error) {
      setStatusError(toUserFacingError(error, "data.save", { title: "User status could not be changed", message: "Refresh the account status before trying again." }));
      setPendingStatusChange(null);
    } finally {
      setIsSaving(false);
    }
  }

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
      setLoadError(toUserFacingError(error, "data.load"));
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
      const matchesStatus = statusFilter === "all" || (user.status ?? "active") === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, search, statusFilter, users]);

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

  const pendingStatusCopy = pendingStatusChange
    ? statusChangeCopy(pendingStatusChange)
    : null;

  async function handleSaveUser(input: {
    userId: string;
    role: UserRole;
    machineIds: string[];
    stepUpCode?: string;
  }) {
    const currentUser = users.find((user) => user.id === input.userId);

    if (!currentUser) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const result = await provider.updateUserAccess(input.userId, {
        role: input.role, machineIds: input.machineIds, stepUpCode: input.stepUpCode,
      });

      if (result.sessionRevoked) {
        setIsDialogOpen(false);
        // Reloading the profile recognises the revoked session and clears
        // client auth state; do not issue another admin-only load afterward.
        await refreshUsers();
        toast.success("User access updated. Sign in again to continue.");
        router.replace("/login");
        router.refresh();
        return;
      }

      await Promise.all([loadData(), refreshUsers()]);
      toast.success("User access updated");
      setIsDialogOpen(false);

      router.refresh();
    } catch (error) {
      setSaveError(
        toUserFacingError(error, "data.save", {
          title: "User access could not be saved",
          message: "Refresh the account details before trying again.",
        }),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div><CardTitle className="text-sm">User management</CardTitle>
          <CardDescription className="text-sm">
            Create accounts with generated activation links and manage access.
          </CardDescription>
          </div><CardAction><Button size="sm" onClick={() => setIsInviteOpen(true)}>Create user</Button></CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
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
              <SelectTrigger aria-label="Filter by role" className="w-full sm:w-40">
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
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as UserStatus | "all")}>
              <SelectTrigger aria-label="Filter by status" className="w-full sm:w-40"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="deactivated">Deactivated</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>

          {loadError ? (
            <ErrorNotice error={loadError} actionLabel="Try Again" onAction={() => void loadData()} />
          ) : null}
          {statusError ? <ErrorNotice error={statusError} /> : null}

          <div className="overflow-x-auto border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
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
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
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
                        <TableCell><Badge variant={user.status === "active" || !user.status ? "outline" : "destructive"}>{user.status ?? "active"}</Badge></TableCell>
                        <TableCell>
                          {machineIdsByUserId[user.id]?.length ?? 0}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2"><Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setSaveError(null);
                              setIsDialogOpen(true);
                            }}
                          >
                            Manage access
                          </Button>{user.status === "active" || !user.status ? <><Button variant="destructive" size="sm" onClick={() => setPendingStatusChange({ user, status: "suspended" })}>Suspend</Button><Button variant="destructive" size="sm" onClick={() => setPendingStatusChange({ user, status: "deactivated" })}>Deactivate</Button></> : <Button variant="outline" size="sm" onClick={() => setPendingStatusChange({ user, status: "active" })}>Reactivate</Button>}</div>
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
        error={saveError}
        machines={machines}
        user={selectedUser}
        onOpenChange={(open) => {
          setIsDialogOpen(open);

          if (!open) {
            setSelectedUserId(null);
            setSaveError(null);
          }
        }}
        onSave={handleSaveUser}
      />
      <InvitationManagement refreshKey={invitationRefreshKey} />
      <UserInviteDialog open={isInviteOpen} onOpenChange={setIsInviteOpen} machines={machines} onCreated={() => { setInvitationRefreshKey((value) => value + 1); void loadData(); }} />
      <Dialog open={Boolean(pendingStatusChange)} onOpenChange={(open) => { if (!open) setPendingStatusChange(null); }}><DialogContent><DialogHeader><DialogTitle>{pendingStatusCopy?.title}</DialogTitle><DialogDescription>{pendingStatusCopy?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingStatusChange(null)}>Cancel</Button><Button variant={pendingStatusCopy?.destructive ? "destructive" : "default"} disabled={isSaving} onClick={() => void applyStatusChange()}>{isSaving ? "Saving…" : pendingStatusCopy?.action}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
