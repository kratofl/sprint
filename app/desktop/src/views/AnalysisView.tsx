import { useEffect, useRef, useState } from 'react'
import { BarChart3, Download, FolderOpen, X } from 'lucide-react'
import { bridge } from '../bridge'
import type { LapExportResult, SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { PageHeader } from '../shell/PageHeader'
import { usePageUp } from '../shell/pageUp'
import { EMPTY_ANALYSIS_STATE, buildAnalysisSelectSession, buildSetRunSetup, importNotice, parseAnalysisState } from './AnalysisDomain'
import type { AnalysisState, CorpusLap, LapFileNotice } from './AnalysisDomain'
import { DEFAULT_LAP_LAYOUT, parseLapLayout } from './AnalysisLapLayout'
import { LapPage, useStoredLapLayout } from './AnalysisLapPage'
import { SessionList } from './AnalysisSessionList'
import { LapList, LapTimesCard, SessionHead } from './AnalysisSessionPage'
import type { LapOrder } from './AnalysisSessionPage'
import { sessionsIn } from './AnalysisSessions'
import type { ListScope } from './AnalysisSessions'
import { MenuLayer } from './DashesMenus'
import type { MenuAnchor } from './DashesMenus'
import { buildSetTarget } from './OnTrackDomain'
import { lapKeyOf, sameLap } from './OnTrackLaps'
import type { LapKey } from './OnTrackLaps'
import './AnalysisView.css'

/**
 * Analysis: the laps Sprint recorded, imported or was sent, over three pages at the full content
 * width. The list (your sessions grouped by car and track, or — Mine | Shared — the laps others
 * shared with you; AnalysisSessionList.tsx), one session (its lap times and its laps by run,
 * AnalysisSessionPage.tsx), and one lap on its own (the track map and its channels,
 * AnalysisLapPage.tsx), where comparing with another lap is the driver's choice. Any lap with a
 * line can also become On track's training target or be saved as a lap file.
 *
 * Which session is open is host state (`analysis.selectSession`, so the Overview can open one);
 * the open lap, the lap compared with, the list shown, the lap order and the list's filters are
 * local, and the lap page's arrangement is kept per viewer (`useStoredLapLayout`). The host sends
 * every session live (`state.analysis.sessions`), so the list needs no refresh.
 */
export function AnalysisView({
  runtime,
  send,
  focusSessionId,
  onImportResults,
}: {
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
  /** A session to open on mount (an Overview session row), applied once — see the effect below. */
  focusSessionId?: string
  /** Opens the shell's import dialog; absent when the game has no results archive. */
  onImportResults?: () => void
}) {
  const analysis: AnalysisState = runtime.kind === 'ready' ? parseAnalysisState(runtime.sprint) : EMPTY_ANALYSIS_STATE

  const [openLap, setOpenLap] = useState<LapKey | null>(null)
  const [compareWith, setCompareWith] = useState<LapKey | null>(null)
  const [scope, setScope] = useState<ListScope>('mine')
  const [order, setOrder] = useState<LapOrder>('LapNumber')
  const [layout, setLayout] = useStoredLapLayout(parseLapLayout, DEFAULT_LAP_LAYOUT)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lapFileNotice, setLapFileNotice] = useState<LapFileNotice | null>(null)

  const runAction = async (command: SprintCommand) => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That change could not be applied.')
    }
  }
  const closeLap = () => {
    setOpenLap(null)
    setCompareWith(null)
  }
  const openSession = (sessionId: string | null) => {
    closeLap()
    void runAction(buildAnalysisSelectSession(sessionId))
  }

  // `focusSessionId` names a session for one render only (the shell clears it after handing it
  // off — see App.tsx), so this opens it once.
  useEffect(() => {
    if (!focusSessionId) return
    setOpenLap(null)
    setCompareWith(null)
    send(buildAnalysisSelectSession(focusSessionId)).catch((error: unknown) =>
      setActionError(error instanceof Error ? error.message : 'That session could not be opened.'),
    )
  }, [focusSessionId, send])

  const { session, courseLaps } = analysis
  // Compare offers every lap with a line with this car here; "your best" is your fastest of them all.
  const drawable = courseLaps.filter((lap) => lap.hasChannels)
  const yourBest = courseLaps.find((lap) => !lap.sharedFrom) ?? null
  const lap = session && openLap ? (analysis.laps.find((candidate) => sameLap(candidate, openLap)) ?? null) : null
  const other = lap && compareWith ? (drawable.find((candidate) => sameLap(candidate, compareWith)) ?? null) : null
  const page = session === null ? 'list' : lap ? 'lap' : 'session'
  const sharedCount = sessionsIn(analysis.sessions, 'shared').length

  usePageUp(page === 'list' ? null : page === 'lap' ? (session?.label ?? 'Session') : 'All sessions', () => (page === 'lap' ? closeLap() : openSession(null)))

  if (runtime.kind === 'loading') {
    return (
      <div className="analysis-page">
        <PageHeader title="Analysis" />
        <div className="card skeleton analysis-card-skeleton" />
      </div>
    )
  }

  const exportLap = async (target: CorpusLap) => {
    setLapFileNotice(exportNotice(await bridge.exportLap(target.sessionId, target.lapNumber)))
  }
  const importLap = async () => {
    setLapFileNotice(importNotice(await bridge.importLap()))
  }
  const trainAgainst = async (target: CorpusLap) => {
    setActionError(null)
    try {
      await send(buildSetTarget(target))
      setLapFileNotice({ tone: 'success', title: 'Training lap set', message: `${target.label}. Start training from On track.` })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That lap could not be set.')
    }
  }

  return (
    <div className="analysis-page">
      <PageHeader title="Analysis">
        {page === 'list' && (
          <>
            <ScopeSwitch scope={scope} sharedCount={sharedCount} onScope={setScope} />
            <ImportButton onLapFile={() => void importLap()} onResults={onImportResults} />
          </>
        )}
      </PageHeader>

      {actionError && (
        <div className="infobar error" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">Not applied</strong>
          <span className="infobar-message">{actionError}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setActionError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {lapFileNotice && (
        <div className={`infobar ${lapFileNotice.tone}`} role={lapFileNotice.tone === 'error' ? 'alert' : 'status'}>
          <span className="infobar-icon">{lapFileNotice.tone === 'error' ? '!' : 'i'}</span>
          <strong className="infobar-title">{lapFileNotice.title}</strong>
          <span className="infobar-message">{lapFileNotice.message}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setLapFileNotice(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {analysis.notice && page === 'session' && (
        <div className="infobar info" role="status">
          <span className="infobar-icon">i</span>
          <span className="infobar-message">{analysis.notice}</span>
        </div>
      )}

      {session && lap ? (
        <LapPage
          lap={lap}
          session={session}
          runs={analysis.runs}
          sessionLaps={analysis.laps}
          courseLaps={drawable}
          yourBest={yourBest}
          compareWith={other}
          layout={layout}
          onLayout={setLayout}
          onCompare={(picked) => setCompareWith(picked ? lapKeyOf(picked) : null)}
          onBack={closeLap}
          onTrain={(target) => void trainAgainst(target)}
        />
      ) : session ? (
        <>
          <SessionHead session={session} onBack={() => openSession(null)} />
          <LapTimesCard laps={analysis.laps} runs={analysis.runs} yourBest={yourBest} onOpen={(picked) => setOpenLap(lapKeyOf(picked))} />
          <LapList
            laps={analysis.laps}
            runs={analysis.runs}
            // Setup files name the model ("Porsche 963"), not the car's name ("Hypercar Porsche").
            car={session.context.carType ?? session.context.carModel}
            order={order}
            onOrder={setOrder}
            onSetRunSetup={(outing, setupId) => void runAction(buildSetRunSetup(outing, setupId))}
            onOpen={(picked) => setOpenLap(lapKeyOf(picked))}
            onExport={(target) => void exportLap(target)}
            onTrain={(target) => void trainAgainst(target)}
          />
        </>
      ) : analysis.sessions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={28} strokeWidth={1.5} />
            <h2>No laps recorded yet</h2>
            <p>Drive a session, or import one, and it will appear here.</p>
          </div>
        </div>
      ) : (
        <SessionList sessions={analysis.sessions} scope={scope} onOpen={(id) => openSession(id)} />
      )}
    </div>
  )
}

/** Mine | Shared: your sessions, or the laps others shared with you, never one list of both. */
function ScopeSwitch({ scope, sharedCount, onScope }: { scope: ListScope; sharedCount: number; onScope: (scope: ListScope) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Laps shown">
      <button type="button" role="radio" className="segmented-item" aria-checked={scope === 'mine'} onClick={() => onScope('mine')}>
        Mine
      </button>
      <button type="button" role="radio" className="segmented-item" aria-checked={scope === 'shared'} onClick={() => onScope('shared')}>
        Shared
        {sharedCount > 0 && <span className="analysis-scope-count tabular">{sharedCount}</span>}
      </button>
    </div>
  )
}

/** "Import…": a lap file someone sent you, or the game's results archive when it has one. */
function ImportButton({ onLapFile, onResults }: { onLapFile: () => void; onResults?: () => void }) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }
  const act = (action: () => void) => {
    close()
    action()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="button subtle"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenuAt({ x: box.right - 240, y: box.bottom + 4 })
        }}
      >
        <Download /> Import…
      </button>
      {menuAt && (
        <MenuLayer anchor={menuAt} label="Import" width={240} onClose={close}>
          <button type="button" role="menuitem" className="menu-item" onClick={() => act(onLapFile)}>
            <FolderOpen size={14} /> A shared lap file…
          </button>
          {onResults && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => act(onResults)}>
              <Download size={14} /> The game’s results…
            </button>
          )}
        </MenuLayer>
      )}
    </>
  )
}

const exportNotice = (result: LapExportResult): LapFileNotice | null => {
  switch (result.outcome) {
    case 'cancelled':
      return null
    case 'failed':
      return { tone: 'error', title: 'Lap not saved', message: result.error }
    case 'saved':
      return { tone: 'success', title: 'Lap saved', message: `${result.fileName}. Send it on; it opens with Import… in Analysis.` }
  }
}
