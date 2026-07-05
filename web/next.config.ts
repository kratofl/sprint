import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for optimized Docker image (copies only what's needed to run)
  output: 'standalone',

  // The API server runs separately — proxy REST + GraphQL calls in dev
  async rewrites() {
    const apiUrl = process.env.API_URL ?? 'http://localhost:8080'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/graphql',
        destination: `${apiUrl}/graphql`,
      },
    ]
  },
}

export default nextConfig
