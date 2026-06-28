import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverApiBaseUrl = process.env.SERVER_API_BASE_URL ?? "http://localhost:8000"

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${serverApiBaseUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
