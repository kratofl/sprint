import { useCallback, useRef, useState } from 'react'
import type { Toast, ToastInput } from './toast'

/** Toasts auto-dismiss after this long, so a missed one can still be read. */
const TOAST_LIFETIME_MS = 12_000
/** Matches the CSS `.toast.leaving` transition (`--motion-normal`); the DOM node is removed once it finishes. */
const TOAST_EXIT_MS = 167

/**
 * Owns the shell's toast stack: auto-dismiss timers, and a `leaving` set so the
 * exit fade/translate has time to play before a toast is actually removed from
 * `toasts`. Shell-only (see App.tsx) — views never see this.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  const lifetimeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = lifetimeTimers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      lifetimeTimers.current.delete(id)
    }
    setLeaving((current) => (current.has(id) ? current : new Set(current).add(id)))
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      setLeaving((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, TOAST_EXIT_MS)
  }, [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current, { ...input, id }])
      lifetimeTimers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_LIFETIME_MS),
      )
    },
    [dismiss],
  )

  return { toasts, leaving, show, dismiss }
}
