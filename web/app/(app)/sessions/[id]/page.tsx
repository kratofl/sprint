import type { Metadata } from 'next'
import { Unavailable } from '@/components/app/unavailable'
import { loadSession, loadSessionTelemetry } from '@/lib/server/data'
import SessionView from './SessionView'

export const metadata: Metadata = { title: 'Session – Sprint' }

// One session: its laps, its recorded telemetry and, for the driver, which race
// engineers may see it. A session the viewer may not see is a 404. Telemetry
// loads separately, so the page still shows the laps when history is unavailable.
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [session, telemetry] = await Promise.all([loadSession(id), loadSessionTelemetry(id)])
  if (session.kind === 'unavailable') {
    return <Unavailable title="Session" heading="Couldn’t load this session" message={session.message} retryHref={`/sessions/${encodeURIComponent(id)}`} />
  }
  return <SessionView session={session.data} telemetry={telemetry} />
}
