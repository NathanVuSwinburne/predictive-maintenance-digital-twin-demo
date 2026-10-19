import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: dirname,
  },
}

export default nextConfig
