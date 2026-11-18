import { useEffect, useState } from 'react'
import { bridge } from '../bridge'
import type { SetupDriven, SetupLibrary, SetupRef, SetupSheet } from './SetupsDomain'

export type LibraryState = { kind: 'loading' } | SetupLibrary

/**
 * The game's setups, fetched on demand (bridge.setups) rather than polled: the host reads the
 * game's setup folder for it. Fetched again whenever `refresh` changes, so coming back to the
 * list shows what the game saved meanwhile. Keeps the last list on screen while it refreshes.
 */
export function useSetupLibrary(refresh: number): LibraryState {
  const [state, setState] = useState<LibraryState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void bridge.setups().then((library) => {
      if (!cancelled) setState(library)
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  return state
}

export type SheetState = { kind: 'loading' } | { kind: 'ready'; sheet: SetupSheet } | { kind: 'missing' }

/**
 * One setup's values, fetched when the setup or version asked for changes, and again when
 * `refresh` does (after a tag) with the shown sheet kept meanwhile; null asks for none.
 */
export function useSetupSheet(ref: SetupRef | null, refresh = 0): SheetState {
  const [state, setState] = useState<{ key: string; sheet: SheetState } | null>(null)
  const id = ref?.id ?? null
  const version = ref?.version ?? null
  const key = `${id ?? ''}
${version ?? ''}`

  useEffect(() => {
    if (id === null) return
    let cancelled = false
    void bridge.setupSheet(id, version).then((sheet) => {
      if (!cancelled) setState({ key, sheet: sheet ? { kind: 'ready', sheet } : { kind: 'missing' } })
    })
    return () => {
      cancelled = true
    }
  }, [id, version, key, refresh])

  return state !== null && state.key === key ? state.sheet : { kind: 'loading' }
}

/**
 * How each version of setup `id` drove, over the runs the driver put it on in Analysis; null
 * while loading, for no setup, or when it could not be read.
 */
export function useSetupDriven(id: string | null): SetupDriven[] | null {
  const [state, setState] = useState<{ id: string; driven: SetupDriven[] | null } | null>(null)

  useEffect(() => {
    if (id === null) return
    let cancelled = false
    void bridge.setupDriven(id).then((driven) => {
      if (!cancelled) setState({ id, driven })
    })
    return () => {
      cancelled = true
    }
  }, [id])

  return state !== null && state.id === id ? state.driven : null
}
