"use client"

import Link from "next/link"
import { ShieldSlashIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type AccessDeniedStateProps = {
  title?: string
  description: string
  actionHref?: string
  actionLabel?: string
}

export function AccessDeniedState({
  title = "Not authorised",
  description,
  actionHref = "/dashboard",
  actionLabel = "Back to dashboard",
}: AccessDeniedStateProps) {
  return (
    <Empty className="border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldSlashIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </Empty>
  )
}
