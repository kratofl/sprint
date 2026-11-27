import { useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react'
import { Popover } from '../shell/Menu'
import type { CorpusRun, RunSetup } from './AnalysisDomain'
import { CarAtTrack, MakerLogo } from './CarBadges'
import { searchSetups, setupsForSession, shortDate } from './SetupsDomain'
import { moveInSearchList } from './searchListKeys'
import { useSetupLibrary } from './useSetups'
import './SetupsView.css'

/**
 * Which setup a run was driven with: a button naming it, or "Pick the setup…" until the driver
 * says. Opens a searchable list of the game's setups for the session's car and circuit, read when
 * it opens; a search narrows that list, never widens it. Nothing is ever picked for the driver;
 * "Same as before" only puts the run before's setup at the top.
 */
export function RunSetupButton({
  run,
  before,
  session,
  onPick,
}: {
  run: CorpusRun
  /** The setup on the run before this one, if the driver put one on it. */
  before: RunSetup | null
  /** The session's car as laps are filed ("LMP2 ELMS") and its circuit: only their setups are listed. */
  session: SetupSession
  /** A setup's list id, or null to take the run's setup off. */
  onPick: (setupId: string | null) => void
}) {
  const [anchor, setAnchor] = useState<MenuPlace | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setAnchor(null)
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`analysis-run-setup${run.setup ? '' : ' empty'}`}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={run.setup ? `Setup: ${run.setup.name}. Change it` : 'Pick the setup this run was driven with'}
        title={run.setup?.name}
        onClick={(event) => {
          setAnchor(placeBelowOrAbove(event.currentTarget.getBoundingClientRect()))
        }}
      >
        {run.setup ? (
          <>
            <SlidersHorizontal />
            <strong>{run.setup.name}</strong>
            <ChevronDown />
          </>
        ) : (
          <>
            <Plus /> Pick the setup…
          </>
        )}
      </button>
      {anchor && (
        <RunSetupMenu
          anchor={anchor}
          current={run.setup}
          before={before && before.setupId !== run.setup?.setupId ? before : null}
          session={session}
          onClose={close}
          onPick={(setupId) => {
            close()
            onPick(setupId)
          }}
        />
      )}
    </>
  )
}

/** The list itself, mounted only while open so the game's setups are read when it opens. */
function RunSetupMenu({
  anchor,
  current,
  before,
  session,
  onClose,
  onPick,
}: {
  anchor: MenuPlace
  current: RunSetup | null
  before: RunSetup | null
  session: SetupSession
  onClose: () => void
  onPick: (setupId: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const library = useSetupLibrary(0)
  const setups = library.kind === 'ready' ? searchSetups(setupsForSession(library.setups, session.carModel, session.circuitId), query, null) : []
  const showBefore = before !== null && query.trim() === ''

  return (
    <Popover
      label="Setup for this run"
      className="setups-picker-menu"
      style={{ left: Math.max(8, Math.min(anchor.right - 360, window.innerWidth - 368)), ...anchor.vertical }}
      onClose={onClose}
      onKeyDown={(event) => {
        if (moveInSearchList(event.currentTarget, event.key)) event.preventDefault()
      }}
    >
      <input type="search" placeholder="Search setup, car or track" aria-label="Search setups" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
      <div className="setups-picker-list" role="listbox" aria-label="Setups">
        {library.kind === 'loading' && <p className="setups-none">Reading the game’s setups…</p>}
        {(library.kind === 'unavailable' || library.kind === 'failed') && <p className="setups-none">The game’s setups could not be read.</p>}
        {showBefore && (
          <>
            <span className="analysis-run-menu-section">Same as before</span>
            <SetupOption
              name={before.name}
              make={library.kind === 'ready' ? (library.setups.find((setup) => setup.id === before.setupId)?.make ?? null) : null}
              detail="The run before"
              picked={false}
              onPick={() => onPick(before.setupId)}
            />
            <span className="analysis-run-menu-section">For this car and track</span>
          </>
        )}
        {library.kind === 'ready' && setups.length === 0 && (
          <p className="setups-none">{query.trim() === '' ? `No setups for the ${session.carModel} at ${session.circuitName}.` : 'No setups match.'}</p>
        )}
        {setups.map((setup) => (
          <SetupOption
            key={setup.id}
            name={setup.name}
            make={setup.make}
            detail={
              <>
                <CarAtTrack car={setup.car} track={setup.trackName} country={setup.country} /> · saved {shortDate(setup.savedAt)}
              </>
            }
            picked={setup.id === current?.setupId}
            onPick={() => (setup.id === current?.setupId ? onClose() : onPick(setup.id))}
          />
        ))}
      </div>
      {current && (
        <button type="button" className="menu-item analysis-run-menu-clear" onClick={() => onPick(null)}>
          <span className="setups-menu-check">
            <X />
          </span>
          Take the setup off
        </button>
      )}
    </Popover>
  )
}

/** The session a run belongs to, as far as its setups go. */
export type SetupSession = { carModel: string; circuitId: string; circuitName: string }

/** One setup to pick: its maker's badge, its name, and a line under it (the car at the track and when it was saved). */
function SetupOption({ name, make, detail, picked, onPick }: { name: string; make: string | null; detail: ReactNode; picked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={picked} className="menu-item setups-picker-item" onClick={onPick}>
      <span className="setups-menu-check">{picked && <Check />}</span>
      <MakerLogo make={make} small />
      <span className="setups-picker-text">
        <span>{name}</span>
        <span className="setups-dim">{detail}</span>
      </span>
    </button>
  )
}

/** Where the list opens: under the button, or above it when the window has no room below. */
type MenuPlace = { right: number; vertical: { top: number } | { bottom: number } }

const MENU_HEIGHT = 460

const placeBelowOrAbove = (box: DOMRect): MenuPlace => ({
  right: box.right,
  vertical: window.innerHeight - box.bottom >= MENU_HEIGHT || box.top < MENU_HEIGHT ? { top: box.bottom + 4 } : { bottom: window.innerHeight - box.top + 4 },
})

