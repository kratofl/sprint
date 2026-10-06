import type { NextConfig } from 'next'

// The browser never talks to the API: server components and Server Actions call
// it server-side at API_URL (lib/server/api.ts), and /api/health is a route
// handler. So there are no rewrites.
const nextConfig: NextConfig = {
  // Required for optimized Docker image (copies only what's needed to run)
  output: 'standalone',
  // Bottom-left (the default) covers the account row at the foot of the sidebar.
  devIndicators: { position: 'bottom-right' },
}

export default nextConfig
