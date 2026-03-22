import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for optimized Docker image (copies only what's needed to run)
  output: 'standalone',

  // The API server runs separately — proxy API calls in dev
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:8080'}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
