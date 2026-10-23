import { NextResponse } from 'next/server'

// Health check for the web container: reports the web as up and passes on the
// API's own health (reached over the internal API_URL).
export async function GET() {
  const apiUrl = process.env.API_URL ?? 'http://localhost:8080'
  try {
    const res = await fetch(`${apiUrl}/api/health`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json({ web: 'ok', api: data })
  } catch {
    return NextResponse.json({ web: 'ok', api: 'unreachable' }, { status: 503 })
  }
}
