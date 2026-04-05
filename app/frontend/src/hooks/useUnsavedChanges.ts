import { useState, useCallback, useRef } from 'react'

/**
 * Tracks whether a value has unsaved changes compared to a saved snapshot.
 * Uses JSON serialization for deep equality.
 * Call `markSaved(current)` after a successful save to reset the baseline.
 */
export function useUnsavedChanges<T>(current: T, initialSaved: T) {
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialSaved))
  const isDirty = JSON.stringify(current) !== savedSnapshot
  const markSaved = useCallback((value: T) => {
    setSavedSnapshot(JSON.stringify(value))
  }, [])
  return { isDirty, markSaved }
}

/**
 * Returns a guardedNavigate function that shows a confirmation dialog before
 * executing an action when there are unsaved changes.
 */
export function useNavigationGuard(isDirty: boolean) {
  const [showDialog, setShowDialog] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)

  const guardedNavigate = useCallback((action: () => void) => {
    if (!isDirty) {
      action()
      return
    }
    pendingAction.current = action
    setShowDialog(true)
  }, [isDirty])

  const confirm = useCallback(() => {
    setShowDialog(false)
    pendingAction.current?.()
    pendingAction.current = null
  }, [])

  const cancel = useCallback(() => {
    setShowDialog(false)
    pendingAction.current = null
  }, [])

  return { showDialog, guardedNavigate, confirm, cancel }
}
