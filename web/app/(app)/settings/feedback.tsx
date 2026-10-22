'use client'

import { useEffect } from 'react'
import { useToast } from '@/components/app/toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { SaveState } from '@/lib/settings'

// How a settings form reports a save: a toast confirms it, a failure stays inline
// in the form that raised it. Each save lands as a new state object, so every
// save confirms again.

/** Raises `message` as a toast whenever `state` turns into a fresh save. */
export function useSavedToast(state: SaveState, message: string) {
  const toast = useToast()
  useEffect(() => {
    if (state.kind === 'saved') toast(message)
  }, [state, toast, message])
}

/** The API's error for a failed save, as an inline banner; nothing otherwise. */
export function SaveError({ state }: { state: SaveState }) {
  if (state.kind !== 'failed') return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  )
}
