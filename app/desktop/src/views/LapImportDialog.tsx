import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { bridge } from '../bridge'
import type { LapFileOffer } from '../bridge'
import { ContentDialog } from '../shell/ContentDialog'
import { importNotice, lapFileFacts, lapFileFailed } from './AnalysisDomain'
import type { LapFileNotice } from './AnalysisDomain'

/** Where an import of a friend's lap file stands: nothing open, waiting for Add, or adding. */
type LapImport = { phase: 'closed' } | { phase: 'confirm'; offer: LapFileOffer } | { phase: 'adding'; offer: LapFileOffer }

/**
 * Importing a friend's `.sprintlap` (#198), for Analysis and On track alike: `open` shows the
 * file picker, the host reads the file without filing it, and `dialog` shows what it holds until
 * the driver adds it or cancels. Nothing goes into the corpus before Add. A file that cannot be
 * read, and how the add went, come back through `onNotice` for the page's own infobar.
 */
export function useLapFileImport(onNotice: (notice: LapFileNotice | null) => void): { open: () => void; dialog: ReactNode } {
  const [state, setState] = useState<LapImport>({ phase: 'closed' })

  const open = async () => {
    onNotice(null)
    const result = await bridge.openLapFile()
    if (result.outcome === 'opened') setState({ phase: 'confirm', offer: result.offer })
    else if (result.outcome === 'failed') onNotice(lapFileFailed(result.error))
  }
  const cancel = () => {
    if (state.phase !== 'confirm') return
    void bridge.discardLapFile(state.offer.token)
    setState({ phase: 'closed' })
  }
  const add = async (offer: LapFileOffer) => {
    // Announced before awaiting, so Add shows it is working and cannot be pressed twice.
    setState({ phase: 'adding', offer })
    const result = await bridge.importLapFile(offer.token)
    setState({ phase: 'closed' })
    onNotice(importNotice(result))
  }

  return {
    open: () => void open(),
    dialog: state.phase === 'closed' ? null : <LapImportDialog offer={state.offer} adding={state.phase === 'adding'} onAdd={(offer) => void add(offer)} onCancel={cancel} />,
  }
}

/** When the lap was driven: "Fri, Oct 2, 2026, 21:10". */
const drivenWhen = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** What an opened lap file holds, and Add or Cancel. A lap already in the driver's laps has nothing to add. */
function LapImportDialog({ offer, adding, onAdd, onCancel }: { offer: LapFileOffer; adding: boolean; onAdd: (offer: LapFileOffer) => void; onCancel: () => void }) {
  return (
    <ContentDialog
      title="Import a shared lap"
      className="lap-import-dialog"
      onCancel={onCancel}
      footer={
        offer.alreadyPresent ? (
          // Nothing to decide: one way out, primary because it is the only thing to do.
          <button type="button" className="button primary" onClick={onCancel} autoFocus>
            Close
          </button>
        ) : (
          <>
            <button type="button" className="button primary" disabled={adding} onClick={() => onAdd(offer)} autoFocus>
              <Plus /> {adding ? 'Adding…' : 'Add'}
            </button>
            <button type="button" className="button" disabled={adding} onClick={onCancel}>
              Cancel
            </button>
          </>
        )
      }
    >
      {offer.alreadyPresent ? (
        <div className="infobar info" role="status">
          <span className="infobar-icon">i</span>
          <strong className="infobar-title">Already in your laps</strong>
          <span className="infobar-message">Adding it again would change nothing.</span>
        </div>
      ) : (
        <p className="content-dialog-text">It joins your laps as a shared lap, to compare with in Analysis and to chase on track.</p>
      )}
      <dl className="import-breakdown" aria-label="The lap in the file">
        {lapFileFacts(offer, drivenWhen).map((fact) => (
          <div key={fact.label} className="import-breakdown-row">
            <dt>{fact.label}</dt>
            <dd className={fact.tabular ? 'tabular' : undefined}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </ContentDialog>
  )
}
