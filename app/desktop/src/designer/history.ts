/**
 * Undo history for the dash designer: whole snapshots of the document, newest last. Pure, so the
 * designer's undo rules are testable without React.
 *
 * `group` coalesces a burst of edits into one step: a record with the same non-null group as the
 * step before it replaces that step instead of adding one (arrow-key nudges of one widget, a run
 * of +/- clicks on one field). Any other record, undo or redo ends the burst.
 */
export type History<T> = {
  readonly past: readonly T[]
  readonly present: T
  readonly future: readonly T[]
  readonly group: string | null
}

/** How many steps back undo reaches; older steps fall off. */
export const HISTORY_LIMIT = 100

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], group: null })

/** A new present. Clears redo. */
export function record<T>(history: History<T>, present: T, group: string | null = null, limit = HISTORY_LIMIT): History<T> {
  if (group !== null && history.group === group) return { past: history.past, present, future: [], group }
  const past = [...history.past, history.present]
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present, future: [], group }
}

/** Replaces the present without a step: for changes that are not the user's to undo. */
export const replacePresent = <T>(history: History<T>, present: T): History<T> => ({ ...history, present })

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1]
  if (previous === undefined) return history
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], group: null }
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future
  if (next === undefined) return history
  return { past: [...history.past, history.present], present: next, future, group: null }
}
