import { useRef, useState } from 'react'
import { Check, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react'
import type { CorpusRun, RunSetup } from './AnalysisDomain'
import { carAtTrack, searchSetups, shortDate } from './SetupsDomain'
import type { SetupItem } from './SetupsDomain'
import { moveInSearchList } from './searchListKeys'
import { useSetupLibrary } from './useSetups'
import './SetupsView.css'

/**
 * Which setup a run was driven with: a button naming it, or "Pick the setup…" until the driver
 * says. Opens a searchable list of the game's setups, read when it opens. Nothing is ever picked
 * for the driver; "Same as before" only puts the run before's setup at the top.
 */
export function RunSetupButton({
  run,
  before,
  car,
  onPick,
}: {
  run: CorpusRun
  /** The setup on the run before this one, if the driver put one on it. */
  before: RunSetup | null
  /** The car the session was driven in, to list its setups first. */
  car: string
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
          car={car}
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
  car,
  onClose,
  onPick,
}: {
  anchor: MenuPlace
  current: RunSetup | null
  before: RunSetup | null
  car: string
  onClose: () => void
  onPick: (setupId: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const library = useSetupLibrary(0)
  const setups = library.kind === 'ready' ? searchSetups(library.setups, query, car) : []
  const showBefore = before !== null && query.trim() === ''

  return (
    <div className="dashes-menu-layer" onPointerDown={onClose}>
      <div
        className="menu-flyout setups-picker-menu"
        role="dialog"
        aria-label="Setup for this run"
        style={{ left: Math.max(8, Math.min(anchor.right - 360, window.innerWidth - 368)), ...anchor.vertical }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (moveInSearchList(event.currentTarget, event.key)) {
            event.preventDefault()
          }
        }}
      >
        <input type="search" placeholder="Search setup, car or track" aria-label="Search setups" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
        <div className="setups-picker-list" role="listbox" aria-label="Setups">
          {library.kind === 'loading' && <p className="setups-none">Reading the game’s setups…</p>}
          {(library.kind === 'unavailable' || library.kind === 'failed') && <p className="setups-none">The game’s setups could not be read.</p>}
          {showBefore && (
            <>
              <span className="analysis-run-menu-section">Same as before</span>
              <SetupOption name={before.name} detail="The run before" picked={false} onPick={() => onPick(before.setupId)} />
              <span className="analysis-run-menu-section">All setups</span>
            </>
          )}
          {library.kind === 'ready' && setups.length === 0 && <p className="setups-none">No setups match.</p>}
          {setups.map((setup) => (
            <SetupOption
              key={setup.id}
              name={setup.name}
              detail={setupDetail(setup)}
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
      </div>
    </div>
  )
}

function SetupOption({ name, detail, picked, onPick }: { name: string; detail: string; picked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={picked} className="menu-item setups-picker-item" onClick={onPick}>
      <span className="setups-menu-check">{picked && <Check />}</span>
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

const setupDetail = (setup: SetupItem): string => `${carAtTrack(setup)} · saved ${shortDate(setup.savedAt)}`
