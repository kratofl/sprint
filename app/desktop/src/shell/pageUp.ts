import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * The page above the current one — a list above the item opened from it. Alt+Left / ⌘[ goes
 * here, never to whatever page happened to be visited before: pages are a hierarchy, not a
 * browser history. The page's own way up ("All sessions") stays the visible control.
 */
export type PageUp = { label: string; go: () => void }

/** App provides the setter; null means the current page is a top-level one. */
export const PageUpContext = createContext<(up: PageUp | null) => void>(() => {})

/**
 * Registers the page above this one while `label` is non-null (e.g. "All sessions" while a
 * session is open). `go` may change every render; the latest one is what runs.
 */
export function usePageUp(label: string | null, go: () => void): void {
  const register = useContext(PageUpContext)
  const latest = useRef(go)
  useLayoutEffect(() => {
    latest.current = go
  })

  useEffect(() => {
    if (label === null) return
    register({ label, go: () => latest.current() })
    return () => register(null)
  }, [label, register])
}
