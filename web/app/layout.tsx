import type { Metadata } from 'next'
import './globals.css'
import WebNavRail from '@/components/WebNavRail'
import { StatusStrip } from '@sprint/ui'

const WEB_BUILD = {
  version: '0.0.1',
  channel: 'beta' as const,
}

export const metadata: Metadata = {
  title: 'Sprint',
  description: 'Sim racing telemetry platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-screen overflow-hidden bg-bg-base text-text-primary font-sans antialiased">
        <WebNavRail />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
          <StatusStrip
            connected
            version={WEB_BUILD.version}
            channel={WEB_BUILD.channel}
          />
        </div>
      </body>
    </html>
  )
}
