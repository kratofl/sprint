import type { DashLayout, DashPage } from '@sprint/dashboard'
import { findPage } from '../views/DashesDomain'

/**
 * Page edits the designer needs on top of the `DashesDomain` mutators (group edits are in
 * `groupOps.ts`). Same contract: a new layout, or null when the edit is not possible.
 */

/** Moves a regular page one place earlier (-1) or later (1) in the page order. The idle page has no place in it. */
export function movePage(layout: DashLayout, pageId: string, offset: -1 | 1): DashLayout | null {
  const index = layout.pages.findIndex((page) => page.id === pageId)
  const target = index + offset
  if (index < 0 || target < 0 || target >= layout.pages.length) return null
  const pages = [...layout.pages]
  const [page] = pages.splice(index, 1)
  pages.splice(target, 0, page)
  return { ...layout, pages }
}

/** The page the designer shows for a chosen id: that page while it exists, else the first one (undo can take a page away). */
export const shownPage = (layout: DashLayout, pageId: string): DashPage | null => findPage(layout, pageId) ?? layout.pages[0] ?? layout.idlePage ?? null
