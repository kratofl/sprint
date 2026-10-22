import type { Metadata } from 'next'
import Page from '@/components/Page'
import Unavailable from '@/components/Unavailable'
import { getPreferences, loadSettings } from '@/lib/server/data'
import AccountSection from './AccountSection'
import AppearanceSection from './AppearanceSection'
import ServerSection from './ServerSection'

export const metadata: Metadata = { title: 'Settings – Sprint' }

// Settings page: the account (from the API), this browser's appearance (from
// its cookie) and, for an admin, the server. Each section is a client view
// that saves on its own.
export default async function SettingsPage() {
  const [settings, preferences] = await Promise.all([loadSettings(), getPreferences()])
  if (settings.kind === 'unavailable') {
    return <Unavailable title="Settings" heading="Couldn’t load your settings" message={settings.message} retryHref="/settings" />
  }
  const { account, server } = settings.data
  return (
    <Page title="Settings">
      <div className="settings">
        <AccountSection account={account} />
        <AppearanceSection initial={preferences} />
        {server.kind === 'admin' && <ServerSection settings={server.settings} />}
      </div>
    </Page>
  )
}
