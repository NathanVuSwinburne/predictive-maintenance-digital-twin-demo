"use client"

import { useMemo } from "react"

import { getDataProvider } from "@/lib/data/provider-factory"

export function useDataProvider() {
  return useMemo(() => getDataProvider(), [])
}
