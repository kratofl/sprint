import { NextResponse } from 'next/server'

export async function GET() {
  // Proxy health check to the Go API server
  const apiUrl = process.env.API_URL ?? 'http://localhost:8080'
  try {
    const res = await fetch(`${apiUrl}/api/health`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json({ web: 'ok', api: data })
  } catch {
    return NextResponse.json({ web: 'ok', api: 'unreachable' }, { status: 503 })
  }
}
