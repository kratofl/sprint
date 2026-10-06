import type { ReactNode } from 'react'
import Backdrop from '@/components/Backdrop'
import Sidebar from '@/components/Sidebar'
import { getViewer } from '@/lib/server/data'

// App shell: edge-to-edge glass sidebar + scrolling content. Each page renders
// its own toolbar band through <Page>. The sidebar footer shows who is signed
// in. The ambient backdrop shows through the glass sidebar and, dimmed,
// between the content's cards.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer()
  return (
    <div className="shell">
      <Backdrop tone="ambient" />
      <Sidebar viewer={viewer} />
      <main className="shell-main">{children}</main>
    </div>
  )
}
