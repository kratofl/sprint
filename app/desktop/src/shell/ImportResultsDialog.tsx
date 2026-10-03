import { useEffect, useState } from 'react'
import { Check, Download } from 'lucide-react'
import type { ResultsImportOffer, ResultsImportResult } from '../bridge'
import { ContentDialog } from './ContentDialog'
import {
  afterImport,
  afterSearch,
  canClose,
  declinedOnClose,
  initialImportState,
  offeredSessions,
  sessionCount,
  sessionKindLabel,
} from './resultsImport'
import type { ImportDialogState } from './resultsImport'

/**
 * Import archived sessions (the deleted Avalonia `ImportResultsDialog`, #185): searching, the
 * offer with its per-kind breakdown, importing, and the outcome — all inside one ContentDialog.
 * `offered` is the startup scan's proposal; null means the dialog searches for itself first (the
 * manual action), so a click is answered immediately rather than by a toast somewhere else.
 *
 * Closing an unanswered offer ("Not now", Escape) declines it, which silences the startup
 * prompt for those files; the manual action still offers them again.
 */
export function ImportResultsDialog({
  sourceName,
  offered,
  scan,
  runImport,
  decline,
  onClose,
}: {
  sourceName: string
  offered: ResultsImportOffer | null
  scan: () => Promise<ResultsImportOffer>
  runImport: (entries: readonly string[]) => Promise<ResultsImportResult>
  decline: (entries: readonly string[]) => Promise<void>
  onClose: () => void
}) {
  const [state, setState] = useState<ImportDialogState>(() => initialImportState(offered))
  const searching = state.phase === 'searching'

  useEffect(() => {
    if (!searching) return
    let live = true
    scan()
      .then((offer) => {
        if (live) setState(afterSearch(offer))
      })
      .catch((error: unknown) => {
        if (live) setState({ phase: 'failed', error: error instanceof Error ? error.message : 'The results archive could not be read.' })
      })
    return () => {
      live = false
    }
  }, [searching, scan])

  const close = () => {
    if (!canClose(state)) return
    const declined = declinedOnClose(state)
    if (declined.length > 0) {
      decline(declined).catch((error: unknown) => console.error('Declining the import offer failed', error))
    }
    onClose()
  }

  const startImport = (offer: ResultsImportOffer) => {
    // Announced before awaiting, so the button shows it is working from the first frame and
    // cannot be pressed twice.
    setState({ phase: 'importing', offer })
    runImport(offer.entries)
      .then((result) => setState(afterImport(result)))
      .catch((error: unknown) => setState({ phase: 'failed', error: error instanceof Error ? error.message : 'The import did not finish.' }))
  }

  return (
    <ContentDialog title="Import archived sessions" className="import-results-dialog" onCancel={close} footer={<Footer state={state} onImport={startImport} onClose={close} />}>
      <Body state={state} sourceName={sourceName} />
    </ContentDialog>
  )
}

function Body({ state, sourceName }: { state: ImportDialogState; sourceName: string }) {
  switch (state.phase) {
    case 'searching':
      return (
        <p className="content-dialog-text muted" role="status">
          Looking through {sourceName}…
        </p>
      )
    case 'nothingNew':
      return <Outcome tone="info" title="Nothing new to import" message={`Sprint already has every session in ${sourceName}.`} />
    case 'ready':
    case 'importing':
      return (
        <>
          <p className="content-dialog-text">
            Sprint found {sessionCount(offeredSessions(state.offer))} in {sourceName} that your lap history does not have yet.
          </p>
          <dl className="import-breakdown" aria-label="Sessions found">
            {state.offer.counts.map((row) => (
              <div key={row.kind} className="import-breakdown-row">
                <dt>{sessionKindLabel(row.kind)}</dt>
                <dd className="tabular">{row.count}</dd>
              </div>
            ))}
          </dl>
          <p className="content-dialog-text muted">
            Importing them gives fuel and lap-time estimates something to work from straight away. Nothing is imported until you choose to.
          </p>
        </>
      )
    case 'imported':
      return (
        <Outcome
          tone="success"
          title="Sessions imported"
          message={
            state.importedCount === 0
              ? 'Sprint already had every session in that archive, so nothing changed.'
              : `${sessionCount(state.importedCount)} added to your lap history.`
          }
        />
      )
    case 'failed':
      return <Outcome tone="error" title="Import failed" message={`${state.error} Nothing was added to your lap history.`} />
  }
}

function Outcome({ tone, title, message }: { tone: 'info' | 'success' | 'error'; title: string; message: string }) {
  return (
    <div className={`infobar ${tone} import-outcome`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="infobar-icon">{tone === 'success' ? <Check /> : tone === 'error' ? '!' : 'i'}</span>
      <strong className="infobar-title">{title}</strong>
      <span className="infobar-message">{message}</span>
    </div>
  )
}

function Footer({ state, onImport, onClose }: { state: ImportDialogState; onImport: (offer: ResultsImportOffer) => void; onClose: () => void }) {
  switch (state.phase) {
    case 'searching':
      return (
        <button type="button" className="button" onClick={onClose} autoFocus>
          Cancel
        </button>
      )
    case 'ready':
      return (
        <>
          <button type="button" className="button primary" onClick={() => onImport(state.offer)} autoFocus>
            <Download /> Import
          </button>
          <button type="button" className="button" onClick={onClose}>
            Not now
          </button>
        </>
      )
    case 'importing':
      // The same primary, still in place, now saying it is working and refusing a second press.
      return (
        <button type="button" className="button primary" disabled>
          <Download /> Importing…
        </button>
      )
    default:
      // Nothing left to decide: one way out, primary because it is the only thing to do.
      return (
        <button type="button" className="button primary" onClick={onClose} autoFocus>
          Close
        </button>
      )
  }
}
