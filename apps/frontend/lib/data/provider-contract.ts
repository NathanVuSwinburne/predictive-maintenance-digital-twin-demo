import type { DigitalTwinDataProvider } from "@/lib/data/provider"
import { FastApiDigitalTwinProvider } from "@/lib/data/fastapi-provider"
import { DemoDigitalTwinProvider } from "@/lib/data/demo-provider"

// Compile-time contract guard: the runtime API provider must satisfy the interface.
const apiProvider: DigitalTwinDataProvider = new FastApiDigitalTwinProvider(
  "http://localhost:8000"
)

export const providerContractGuard: DigitalTwinDataProvider[] = [
  apiProvider,
  new DemoDigitalTwinProvider(),
]
