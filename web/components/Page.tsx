import type { ReactNode } from 'react'

type PageProps = {
  // Leading toolbar group: the page title (title-2 role, ≤ 15 characters).
  title: string
  // Centre group: one view control (stepper, segmented control or tab switcher).
  center?: ReactNode
  // Trailing group: icon actions, then the search field last.
  trailing?: ReactNode
  children: ReactNode
}

// Every route renders inside this: the 52px frosted toolbar band, sticky over
// the scrolling content, then the page body.
export default function Page({ title, center, trailing, children }: PageProps) {
  return (
    <>
      <header role="toolbar" aria-label="Toolbar" className="toolbar toolbar-band">
        <div className="toolbar-lead">
          <h1 className="toolbar-title">{title}</h1>
        </div>
        {center}
        <div className="toolbar-trail">{trailing}</div>
      </header>
      <div className="page-content">{children}</div>
    </>
  )
}
