import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashLayout } from '@sprint/dashboard'
import type { SprintCommand } from '../bridge'
import { buildDashSave } from '../views/DashesDomain'
import {
  docCanRedo,
  docCanUndo,
  editDoc,
  isDirty,
  openDesignerDoc,
  receiveHost,
  redoDoc,
  saveFailed,
  saveStatus,
  saveSucceeded,
  undoDoc,
  type DesignerDoc,
  type SaveStatus,
} from './designerDoc'

/** The pause after the last edit before it is saved; a drag or a burst of clicks saves once. */
const SAVE_DELAY_MS = 400

/** Proposes the next layout from the current one, or null when the edit is not possible. */
export type Mutate = (current: DashLayout) => DashLayout | null

export type DesignerDocApi = {
  layout: DashLayout
  status: SaveStatus
  /** Why the last save failed, while it is `failed`. */
  error: string | null
  canUndo: boolean
  canRedo: boolean
  /** Applies an edit; false when `mutate` refused it. `group` coalesces a burst into one undo step. */
  apply: (mutate: Mutate, group?: string) => boolean
  undo: () => void
  redo: () => void
  /** Saves now whatever is not saved yet; resolves once the host has it (or the save failed). */
  flush: () => Promise<void>
}

/**
 * The designer's document (`designerDoc.ts`) wired to the host: every change is saved with
 * `dash.save` once edits pause, the host's copy is taken in as `designerDoc` allows, and a
 * window close waits for the last save. `host` is the dash as the latest state poll has it.
 */
export function useDesignerDoc(host: DashLayout, send: (command: SprintCommand) => Promise<void>): DesignerDocApi {
  const [doc, setDoc] = useState(() => openDesignerDoc(host))
  // The same document, readable synchronously by `apply` and the save loop between renders.
  const docRef = useRef(doc)
  const timer = useRef<number | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const dashId = host.id

  const update = useCallback((change: (current: DesignerDoc) => DesignerDoc): void => {
    const next = change(docRef.current)
    if (next === docRef.current) return
    docRef.current = next
    setDoc(next)
  }, [])

  useEffect(() => update((current) => receiveHost(current, host)), [host, update])

  /** Sends the present if it is not saved yet, one save at a time. */
  const saveNow = useCallback(async (): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    while (inFlight.current) await inFlight.current
    const current = docRef.current
    if (!isDirty(current)) return
    const { version } = current
    const saving = send(buildDashSave(dashId, current.history.present)).then(
      () => update((latest) => saveSucceeded(latest, version)),
      (error: unknown) => update((latest) => saveFailed(latest, error instanceof Error ? error.message : 'The dash could not be saved.')),
    )
    inFlight.current = saving
    await saving
    if (inFlight.current === saving) inFlight.current = null
  }, [dashId, send, update])

  // Every change schedules a save once edits pause. A failed save waits for the next change (an
  // edit clears the failure) or for Retry (`flush`).
  useEffect(() => {
    if (!isDirty(doc) || doc.error !== null) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void saveNow()
    }, SAVE_DELAY_MS)
  }, [doc, saveNow])

  const flush = useCallback(async (): Promise<void> => {
    // A save that lands while another edit arrives leaves the newer one dirty; save until clean.
    while (isDirty(docRef.current)) {
      await saveNow()
      if (docRef.current.error !== null) return
    }
  }, [saveNow])

  // Closing the window waits for the last edit: the close is held, saved, then let through
  // (Electron cancels a close whose `beforeunload` is prevented, without asking).
  const closing = useRef(false)
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (closing.current || !isDirty(docRef.current)) return
      closing.current = true
      event.preventDefault()
      event.returnValue = ''
      void flush().finally(() => window.close())
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flush])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const apply = useCallback(
    (mutate: Mutate, group?: string): boolean => {
      const next = mutate(docRef.current.history.present)
      if (!next) return false
      update((current) => editDoc(current, next, group ?? null))
      return true
    },
    [update],
  )
  const undo = useCallback(() => update(undoDoc), [update])
  const redo = useCallback(() => update(redoDoc), [update])

  return {
    layout: doc.history.present,
    status: saveStatus(doc),
    error: doc.error,
    canUndo: docCanUndo(doc),
    canRedo: docCanRedo(doc),
    apply,
    undo,
    redo,
    flush,
  }
}
