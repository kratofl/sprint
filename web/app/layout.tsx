import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { appearanceStyle, themeAttribute } from '@/lib/preferences'
import { getPreferences } from '@/lib/server/data'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sprint',
  description: 'Sim racing telemetry platform',
}

// Document root for every route. The app shell (sidebar + content) lives in
// (app)/layout.tsx so /sign-in renders without it. The browser's appearance
// preferences (lib/preferences.ts) are applied here, server-side, so the first
// paint already has the chosen theme, motion and glass; without a theme
// choice light/dark follow the OS (tokens handle it).
export default async function RootLayout({ children }: { children: ReactNode }) {
  const preferences = await getPreferences()
  return (
    <html lang="en" data-theme={themeAttribute(preferences.theme)} style={appearanceStyle(preferences)}>
      <body>{children}</body>
    </html>
  )
}
