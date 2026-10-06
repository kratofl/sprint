import Unavailable from '@/components/Unavailable'
import { monthOf } from '@/lib/period'
import { loadOverview } from '@/lib/server/data'
import Overview from './Overview'

// Rendered per request so the stepper opens on the current month.
export const dynamic = 'force-dynamic'

// Overview page: loads the user's sessions and setups, then hands them to the
// client view.
export default async function Home() {
  const overview = await loadOverview()
  if (overview.kind === 'unavailable') {
    return <Unavailable title="Overview" heading="Couldn’t load your overview" message={overview.message} retryHref="/" />
  }
  return <Overview initialMonth={monthOf(new Date())} data={overview.data} />
}
