import type { DashLayout } from '@sprint/dashboard'
import { record, redo, replacePresent, startHistory, undo, canRedo, canUndo, type History } from './history'

/**
 * The dash designer's document: the dash being edited with its undo history, and how far it is
 * saved. Pure, so the save and sync rules are testable without React or the host
 * (`useDesignerDoc` drives it).
 *
 * Every edit is saved whole with `dash.save` shortly after it is made. `version` counts the
 * changes to the present, `confirmed` is the newest version the host is known to hold; the dash
 * is dirty while they differ.
 *
 * The host's copy arrives with every state poll. It replaces the present only while nothing is
 * left to save, and only when it really differs: our own saves come back from the host in its
 * own spelling (nulls, empty lists), so they compare by content (`sameDashDocument`). A copy
 * that differs — a reset to the preset, a new screen size, an edit from another place — becomes
 * a step of its own, so it can be undone like an edit.
 */
export type DesignerDoc = {
  readonly history: History<DashLayout>
  readonly version: number
  readonly confirmed: number
  /** The host's copy as last seen (JSON), so an unchanged poll is ignored cheaply. */
  readonly hostJson: string
  /** Why the last save failed; cleared by the next one that succeeds. */
  readonly error: string | null
}

export type SaveStatus = 'saved' | 'saving' | 'failed'

export const openDesignerDoc = (host: DashLayout): DesignerDoc => ({
  history: startHistory(host),
  version: 0,
  confirmed: 0,
  hostJson: JSON.stringify(host),
  error: null,
})

export const isDirty = (doc: DesignerDoc): boolean => doc.version !== doc.confirmed

export const saveStatus = (doc: DesignerDoc): SaveStatus => (doc.error !== null ? 'failed' : isDirty(doc) ? 'saving' : 'saved')

export const docCanUndo = (doc: DesignerDoc): boolean => canUndo(doc.history)
export const docCanRedo = (doc: DesignerDoc): boolean => canRedo(doc.history)

/**
 * An edit: a new step (or the same step, for an edit in the same `group`), to be saved. An edit
 * after a failed save tries again, so it clears the failure.
 */
export const editDoc = (doc: DesignerDoc, next: DashLayout, group: string | null = null): DesignerDoc => ({
  ...doc,
  history: record(doc.history, next, group),
  version: doc.version + 1,
  error: null,
})

export function undoDoc(doc: DesignerDoc): DesignerDoc {
  if (!canUndo(doc.history)) return doc
  return { ...doc, history: undo(doc.history), version: doc.version + 1, error: null }
}

export function redoDoc(doc: DesignerDoc): DesignerDoc {
  if (!canRedo(doc.history)) return doc
  return { ...doc, history: redo(doc.history), version: doc.version + 1, error: null }
}

/** The save of `version` reached the host. */
export const saveSucceeded = (doc: DesignerDoc, version: number): DesignerDoc => ({
  ...doc,
  confirmed: Math.max(doc.confirmed, version),
  error: null,
})

export const saveFailed = (doc: DesignerDoc, message: string): DesignerDoc => ({ ...doc, error: message })

/** A state poll's copy of this dash (see the type's comment for when it is adopted). */
export function receiveHost(doc: DesignerDoc, host: DashLayout): DesignerDoc {
  const hostJson = JSON.stringify(host)
  if (hostJson === doc.hostJson) return doc
  const seen: DesignerDoc = { ...doc, hostJson }
  if (isDirty(doc)) return seen
  const present = doc.history.present
  if (sameDashDocument(host, present)) {
    // The category is filed from the Dashes page and is no part of the design: follow it, but
    // never as a step to undo (a save keeps the host's category anyway).
    return host.category === present.category ? seen : { ...seen, history: replacePresent(doc.history, { ...present, category: host.category }) }
  }
  const version = doc.version + 1
  return { ...seen, history: record(doc.history, host), version, confirmed: version, error: null }
}

/**
 * Whether two copies of a dash design the same, ignoring the host's spelling: null and absent
 * are the same, so is an empty list, key order does not matter, and neither does the category.
 */
export const sameDashDocument = (a: DashLayout, b: DashLayout): boolean => canonicalJson({ ...a, category: undefined }) === canonicalJson({ ...b, category: undefined })

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && !(Array.isArray(item) && item.length === 0))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]): [string, unknown] => [key, canonical(item)])
  return Object.fromEntries(entries)
}

const canonicalJson = (value: unknown): string => JSON.stringify(canonical(value))
