import type { Metadata } from 'next'
import { SettingsSurface } from '@/components/app/settings-surface'
import { Unavailable } from '@/components/app/unavailable'
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
    <SettingsSurface title="Settings" description="Your account, this browser’s look and the server">
      <AccountSection account={account} />
      <AppearanceSection initial={preferences} />
      {server.kind === 'admin' && <ServerSection settings={server.settings} />}
    </SettingsSurface>
  )
}
