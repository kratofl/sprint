import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Sprint',
  description: 'Sim racing telemetry platform',
}

// App shell: edge-to-edge sidebar + scrolling content. Each page renders its
// own toolbar band through <Page>. Light/dark follow the OS (tokens handle it).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="shell-main">{children}</main>
        </div>
      </body>
    </html>
  )
}
