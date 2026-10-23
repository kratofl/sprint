import type { ReactNode } from 'react'
import { ToolbarContent, type ToolbarContentProps } from '@/components/app/toolbar'

// How every page starts. Everything except the subtitle goes into the toolbar:
// the title, an optional scope control right after it (a PeriodStepper or
// Segmented) with its caption (a footnote, hidden on phones), the icon actions in
// a ToolbarGroup, the page's search, and the page's one primary action last. The
// optional subtitle stays at the top of the content as a footnote line.
export function PageHeader({ subtitle, ...toolbar }: ToolbarContentProps & { subtitle?: ReactNode }) {
  return (
    <>
      <ToolbarContent {...toolbar} />
      {subtitle ? <div className="text-footnote text-label-secondary">{subtitle}</div> : null}
    </>
  )
}
