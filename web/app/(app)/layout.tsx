import type { ReactNode } from 'react'
import Backdrop from '@/components/Backdrop'
import { AppShell } from '@/components/app/app-shell'
import { getViewer } from '@/lib/server/data'

// App shell for every page but sign-in: the glass sidebar with who is signed in,
// the toolbar band and the content. The ambient light trails show through the
// sidebar and toolbar and, dimmed, between the content's cards.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer()
  return (
    <AppShell viewer={viewer} backdrop={<Backdrop tone="ambient" />}>
      {children}
    </AppShell>
  )
}
