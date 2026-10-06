import Unavailable from '@/components/Unavailable'
import { loadSetups } from '@/lib/server/data'
import Setups from './Setups'

// Setup bank page: loads the user's setups, then hands them to the client view
// (which owns the search). Per request, since it reads the cookie.
export default async function SetupsPage() {
  const setups = await loadSetups()
  if (setups.kind === 'unavailable') {
    return <Unavailable title="Setups" heading="Couldn’t load your setups" message={setups.message} retryHref="/setups" />
  }
  return <Setups setups={setups.data} />
}
