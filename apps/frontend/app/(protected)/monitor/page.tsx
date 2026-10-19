import { Suspense } from "react"

import { MonitorLanding } from "@/components/monitor/monitor-landing"

export default function MonitorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the CMTK setup…</p>}>
      <MonitorLanding />
    </Suspense>
  )
}
