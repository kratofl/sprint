import Unavailable from '@/components/Unavailable'
import { loadSessions } from '@/lib/server/data'
import Sessions from './Sessions'

// Session library page: loads the user's sessions, then hands them to the
// client view (which owns the search). Per request, since it reads the cookie.
export default async function SessionsPage() {
  const sessions = await loadSessions()
  if (sessions.kind === 'unavailable') {
    return <Unavailable title="Sessions" heading="Couldn’t load your sessions" message={sessions.message} retryHref="/sessions" />
  }
  return <Sessions sessions={sessions.data} />
}
