import type { DashLayout, DashPage, DashPageJump } from '@sprint/dashboard'
import type { DashMode } from '../bridge'
import { nextId } from '../views/DashesDomain'

/**
 * Which sessions and modes a page shows in, and when the wheel jumps to it — the designer's side
 * of the host's `DashPageModes`. Pure, like the `DashesDomain` mutators: each edit takes the
 * layout and returns a new one, or null when nothing changes.
 */

/** The sessions a page can be picked into, in the order the page panel lists them. */
export const SESSIONS: readonly { id: string; label: string }[] = [
  { id: 'practice', label: 'Practice' },
  { id: 'qualifying', label: 'Qualifying' },
  { id: 'race', label: 'Race' },
]

const SESSION_IDS: ReadonlySet<string> = new Set(SESSIONS.map((session) => session.id))

/** A page left on "every session": nothing picked. */
export const showsEverywhere = (page: DashPage): boolean => (page.showIn ?? []).length === 0

/** The page with its picks replaced; none picked drops the field, so the page shows in every session again. */
function withShowIn(layout: DashLayout, pageId: string, showIn: readonly string[]): DashLayout | null {
  const page = layout.pages.find((candidate) => candidate.id === pageId)
  if (!page) return null
  const next: DashPage = { ...page }
  if (showIn.length > 0) next.showIn = [...showIn]
  else delete next.showIn
  return { ...layout, pages: layout.pages.map((candidate) => (candidate.id === pageId ? next : candidate)) }
}

/**
 * "Every session" on clears the picks; off picks every session, so nothing changes on the wheel
 * until a session is taken away.
 */
export function setEverySession(layout: DashLayout, pageId: string, every: boolean): DashLayout | null {
  const page = layout.pages.find((candidate) => candidate.id === pageId)
  if (!page || showsEverywhere(page) === every) return null
  return withShowIn(layout, pageId, every ? [] : SESSIONS.map((session) => session.id))
}

/** Picks or un-picks one session or mode. Taking the last one away puts the page back on every session. */
export function toggleShowIn(layout: DashLayout, pageId: string, id: string): DashLayout | null {
  const page = layout.pages.find((candidate) => candidate.id === pageId)
  if (!page) return null
  const current = page.showIn ?? []
  return withShowIn(layout, pageId, current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
}

export function setPageJump(layout: DashLayout, pageId: string, jump: DashPageJump | null): DashLayout | null {
  const page = layout.pages.find((candidate) => candidate.id === pageId)
  if (!page || (page.jump ?? null) === jump) return null
  const next: DashPage = { ...page }
  if (jump) next.jump = jump
  else delete next.jump
  return { ...layout, pages: layout.pages.map((candidate) => (candidate.id === pageId ? next : candidate)) }
}

/**
 * The ids of the pages the wheel cycles where the dock previews: `all`, a session id or a mode id —
 * the host's `DashPageModes.CyclePages`. In a session, pages on every session too; in a mode, only
 * that mode's own pages. Never none: a mode no page is in leaves the session's pages (the preview
 * knows no session, so every page), and a session no page is in, every page.
 */
export function cycledPages(pages: readonly DashPage[], preview: string): ReadonlySet<string> {
  const picked = (page: DashPage) => (page.showIn ?? []).includes(preview)
  const cycled = preview === 'all' ? pages : SESSION_IDS.has(preview) ? pages.filter((page) => showsEverywhere(page) || picked(page)) : pages.filter(picked)
  return new Set((cycled.length > 0 ? cycled : pages).map((page) => page.id))
}

/** A fresh id for a mode named `name`: its name in lowercase letters, digits and dashes, unique among `modes`. */
export function newModeId(name: string, modes: readonly DashMode[]): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const base = slug && !SESSION_IDS.has(slug) ? slug : 'mode'
  return nextId(base, (candidate) => modes.some((mode) => mode.id === candidate))
}
