"use client"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { DemoDisclaimer } from "@/components/demo/demo-disclaimer"
import { SimulationRunStatusProvider } from "@/components/simulator/simulation-run-status-context"
import { SidebarInset, SidebarProvider, SidebarRail } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SimulationRunStatusProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarRail />
        <SidebarInset>
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <DemoDisclaimer />}
          <AppHeader />
          <main className="panel-enter flex min-h-[calc(100svh-4rem)] flex-col gap-5 p-4 md:p-6 xl:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </SimulationRunStatusProvider>
  )
}
