"use client"

import { useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const adminLinks = [
  { href: "/admin", label: "Overview", value: "overview" },
  { href: "/admin/users", label: "Users", value: "users" },
  { href: "/admin/machines", label: "Machines", value: "machines" },
]

export function AdminNavigation() {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = useMemo(() => {
    if (pathname.startsWith("/admin/users")) {
      return "users"
    }

    if (pathname.startsWith("/admin/machines")) {
      return "machines"
    }

    return "overview"
  }, [pathname])

  return (
    <Tabs value={activeTab} onValueChange={(value) => {
      const nextLink = adminLinks.find((item) => item.value === value)

      if (nextLink) {
        router.push(nextLink.href)
      }
    }}>
      <TabsList variant="line">
        {adminLinks.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
