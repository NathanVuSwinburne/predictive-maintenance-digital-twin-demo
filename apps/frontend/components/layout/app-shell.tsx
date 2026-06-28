"use client"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SimulationRunStatusProvider } from "@/components/simulator/simulation-run-status-context"
import { SidebarInset, SidebarProvider, SidebarRail } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SimulationRunStatusProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarRail />
        <SidebarInset>
          <AppHeader />
          <div className="flex min-h-[calc(100svh-3.5rem)] flex-col gap-4 p-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </SimulationRunStatusProvider>
  )
}
