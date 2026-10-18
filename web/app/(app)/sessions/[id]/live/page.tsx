import type { Metadata } from 'next'
import { Unavailable } from '@/components/app/unavailable'
import { loadSession } from '@/lib/server/data'
import LiveView from './LiveView'

export const metadata: Metadata = { title: 'Live – Sprint' }

// A session's live view. The page only resolves the session (and its stream key);
// the view then streams it through /api/live/<key>. A session that is not live
// (anymore) still opens: the stream says so and links back to the session.
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await loadSession(id)
  if (session.kind === 'unavailable') {
    return <Unavailable title="Live" heading="Couldn’t load this session" message={session.message} retryHref={`/sessions/${encodeURIComponent(id)}/live`} />
  }
  return <LiveView session={session.data} />
}
