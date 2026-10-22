import { Unavailable } from '@/components/app/unavailable'
import { loadSessions } from '@/lib/server/data'
import Sessions from './Sessions'

// Session library page: loads the sessions the user may see (their own and their
// drivers'), then hands them to the client view, which owns the search and the
// driver filter. `?driver=<id>` opens it filtered to one driver (the engineers
// page links here). Per request, since it reads the cookie.
export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ driver?: string | string[] }> }) {
  const [sessions, { driver }] = await Promise.all([loadSessions(), searchParams])
  if (sessions.kind === 'unavailable') {
    return <Unavailable title="Sessions" heading="Couldn’t load your sessions" message={sessions.message} retryHref="/sessions" />
  }
  return <Sessions sessions={sessions.data} initialDriver={typeof driver === 'string' ? driver : 'all'} />
}
