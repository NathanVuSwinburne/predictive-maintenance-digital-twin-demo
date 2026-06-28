import { RequireAuth } from "@/components/auth/require-auth"
import { AppShell } from "@/components/layout/app-shell"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  )
}
