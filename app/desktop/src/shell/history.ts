import type { AppView } from '../bridge'

/**
 * The shell's page location plus the pages visited before it, newest last.
 * Drives the title-bar back button and Alt+Left; App.tsx holds one of these
 * and only ever changes it through `navigateTo`/`goBack`.
 */
export type ViewHistory = { view: AppView; back: readonly AppView[] }

/** Deep enough for any real session; the oldest entries fall off first. */
const MAX_BACK_ENTRIES = 50

export const initialHistory = (view: AppView): ViewHistory => ({ view, back: [] })

/** Moves to `next`, remembering the current page. Re-selecting the current page is a no-op. */
export const navigateTo = (history: ViewHistory, next: AppView): ViewHistory =>
  history.view === next ? history : { view: next, back: [...history.back, history.view].slice(-MAX_BACK_ENTRIES) }

/** Returns to the previous page, or leaves the history unchanged when there is none. */
export const goBack = (history: ViewHistory): ViewHistory => {
  const previous = history.back[history.back.length - 1]
  return previous === undefined ? history : { view: previous, back: history.back.slice(0, -1) }
}

export const canGoBack = (history: ViewHistory): boolean => history.back.length > 0
