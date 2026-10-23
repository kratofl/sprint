import type { Metadata } from 'next'
import { Unavailable } from '@/components/app/unavailable'
import { loadEngineers } from '@/lib/server/data'
import Engineers from './Engineers'

export const metadata: Metadata = { title: 'Race engineers – Sprint' }

// Race engineers page: who engineers for the signed-in user, their open invite
// links, and the drivers the user engineers for. Per request, since it reads the cookie.
export default async function EngineersPage() {
  const engineers = await loadEngineers()
  if (engineers.kind === 'unavailable') {
    return <Unavailable title="Race engineers" heading="Couldn’t load your race engineers" message={engineers.message} retryHref="/engineer" />
  }
  return <Engineers data={engineers.data} />
}
