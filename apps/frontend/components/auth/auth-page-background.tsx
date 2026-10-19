import type { ReactNode } from "react"

type AuthPageBackgroundProps = {
  children: ReactNode
}

export function AuthPageBackground({ children }: AuthPageBackgroundProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_2%_4%,color-mix(in_oklch,var(--secondary)_45%,transparent)_0,transparent_38%),radial-gradient(circle_at_98%_96%,color-mix(in_oklch,var(--primary)_42%,transparent)_0,transparent_42%),repeating-linear-gradient(120deg,color-mix(in_oklch,var(--border)_45%,transparent)_0,color-mix(in_oklch,var(--border)_45%,transparent)_1px,transparent_1px,transparent_14px),linear-gradient(var(--background),var(--background))] p-6">
      {children}
    </div>
  )
}
