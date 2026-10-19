"use client"

import type { CSSProperties } from "react"

import { DemoDisclaimer } from "@/components/demo/demo-disclaimer"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SimulationRunStatusProvider } from "@/components/simulator/simulation-run-status-context"
import { SidebarInset, SidebarProvider, SidebarRail } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SimulationRunStatusProvider>
      <SidebarProvider
        style={{ "--sidebar-width": "14rem" } as CSSProperties}
      >
        <AppSidebar />
        <SidebarRail />
        <SidebarInset>
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <DemoDisclaimer />}
          <AppHeader />
          <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-screen-2xl flex-col gap-4 px-4 py-5 lg:px-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SimulationRunStatusProvider>
  )
}
