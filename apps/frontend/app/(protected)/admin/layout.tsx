import { AccessDeniedState } from "@/components/auth/access-denied-state";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { requireServerAuth } from "@/lib/auth/server-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireServerAuth("/admin");

  if (user.role !== "admin") {
    return (
      <AccessDeniedState
        title="Admin area only"
        description="You do not have permission to manage users or machine access."
        actionHref="/dashboard"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Manage user roles and machine access.
        </p>
      </div>
      <AdminNavigation />
      {children}
    </div>
  );
}
