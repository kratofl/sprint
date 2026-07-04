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
      <body className="min-h-screen overflow-hidden bg-[var(--bg)] font-inter text-[var(--text)] antialiased">
        <div className="flex h-screen">
          <WebNavRail />
          <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg)] p-[14px]">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
