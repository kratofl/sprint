import type { HistorySessionKind, ResultsImportOffer, ResultsImportResult } from '../bridge'

/**
 * The import dialog's phases — the renderer's copy of `ImportResultsController`
 * (app/Sprint.Desktop.Core/Features/SessionPlanning/ImportResultsController.cs). Searching,
 * "nothing new", success and failure all resolve inside the dialog, never as a toast: each is the
 * answer to what the driver just asked for, so it stays where they are looking until dismissed.
 */
export type ImportDialogState =
  | { phase: 'searching' }
  | { phase: 'nothingNew' }
  | { phase: 'ready'; offer: ResultsImportOffer }
  | { phase: 'importing'; offer: ResultsImportOffer }
  | { phase: 'imported'; importedCount: number }
  | { phase: 'failed'; error: string }

/** The startup prompt opens on the offer its scan already found; the manual action searches first. */
export const initialImportState = (offered: ResultsImportOffer | null): ImportDialogState =>
  offered && offered.entries.length > 0 ? { phase: 'ready', offer: offered } : { phase: 'searching' }

export const afterSearch = (offer: ResultsImportOffer): ImportDialogState =>
  offer.entries.length === 0 ? { phase: 'nothingNew' } : { phase: 'ready', offer }

export const afterImport = (result: ResultsImportResult): ImportDialogState =>
  result.outcome === 'imported' ? { phase: 'imported', importedCount: result.importedCount } : { phase: 'failed', error: result.error }

/**
 * What closing the dialog declines: only an unanswered offer. Closing after an import must not
 * mark those same files declined (`ImportResultsController.Decline`).
 */
export const declinedOnClose = (state: ImportDialogState): readonly string[] => (state.phase === 'ready' ? state.offer.entries : [])

/** The import runs to the end in the host; the dialog stays until it can say how it went. */
export const canClose = (state: ImportDialogState): boolean => state.phase !== 'importing'

const KIND_LABELS: Record<HistorySessionKind, string> = {
  Practice: 'Practice',
  Qualifying: 'Qualifying',
  Race: 'Race',
  Warmup: 'Warmup',
  TestDay: 'Test day',
  Unknown: 'Other',
}

export const sessionKindLabel = (kind: HistorySessionKind): string => KIND_LABELS[kind]

export const sessionCount = (count: number): string => (count === 1 ? '1 session' : `${count} sessions`)

/** How many sessions the offer holds in total (the breakdown lists them per kind). */
export const offeredSessions = (offer: ResultsImportOffer): number => offer.counts.reduce((total, row) => total + row.count, 0)
