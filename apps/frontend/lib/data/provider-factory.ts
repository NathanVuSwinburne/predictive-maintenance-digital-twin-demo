import type { DigitalTwinDataProvider } from "@/lib/data/provider"
import { FastApiDigitalTwinProvider } from "@/lib/data/fastapi-provider"

let provider: DigitalTwinDataProvider | null = null

function resolveApiBaseUrl() {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
  }

  return (
    process.env.SERVER_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000"
  )
}

function resolveProvider(): DigitalTwinDataProvider {
  return new FastApiDigitalTwinProvider(resolveApiBaseUrl())
}

export function getDataProvider() {
  if (!provider) {
    provider = resolveProvider()
  }

  return provider
}
