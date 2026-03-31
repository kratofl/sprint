import type { Metadata } from 'next'
import './globals.css'
import WebNavRail from '@/components/WebNavRail'

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
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
