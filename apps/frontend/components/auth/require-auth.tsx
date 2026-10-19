"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/components/auth/auth-context"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorNotice } from "@/components/feedback/error-notice"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isBootstrapping, isAuthenticated, profileError, retryProfile } = useAuth()

  useEffect(() => {
    if (!isBootstrapping && !isAuthenticated && !profileError) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    }
  }, [isAuthenticated, isBootstrapping, profileError, pathname, router])

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen flex-col gap-2 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (profileError) {
    return <div className="mx-auto w-full max-w-xl p-6"><ErrorNotice error={profileError} actionLabel="Try Again" onAction={() => { void retryProfile() }} /></div>
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
