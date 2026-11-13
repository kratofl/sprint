import { useRef, useState } from 'react'
import { Check, ChevronRight, Crosshair, FolderOpen, GitCompareArrows, Move, Play, Route, Square, X } from 'lucide-react'
import { bridge } from '../bridge'
import type { SprintCommand } from '../bridge'
import { PageHeader } from '../shell/PageHeader'
import { usePageUp } from '../shell/pageUp'
import type { RuntimeState } from '../shell/runtime'
import { formatGap, formatLapSeconds, importNotice } from './AnalysisDomain'
import type { CorpusLap, LapFileNotice } from './AnalysisDomain'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import {
  buildHudArrange,
  buildHudToggle,
  buildSelectCourse,
  buildSetTarget,
  chasingFacts,
  courseKey,
  isTarget,
  listedLaps,
  ownLapCount,
  parseCompareState,
} from './OnTrackDomain'
import type { CompareCourse, CompareState } from './OnTrackDomain'
import { LIST_PAGE, comparePair, drawableLaps, findLap, lapKeyOf, resolvePage } from './OnTrackLaps'
import type { LapKey, OnTrackPage } from './OnTrackLaps'
import { ComparePage, FriendBadge, LapPage, lapWhen, shortDay } from './OnTrackPages'
import './OnTrackView.css'

type Send = (command: SprintCommand) => Promise<void>

/**
 * On track: training against an older lap, yours or a friend's (docs/internals/live-compare.md).
 * Three pages over the whole content width: the list (the lap being chased, then the laps on this
 * track in this car), one lap opened from it (Chase this lap is picked there), and two laps
 * compared (OnTrackPages.tsx). The HUD itself is never drawn here: Arrange HUD puts its windows up
 * on the monitor, unlocked, where they are moved, sized, added and removed; Start training puts
 * them up click-through. All of it is host state (`state.compare`); this view renders it and
 * sends `compare.*`. Which page is open is the only local state.
 */
export function OnTrackView({ runtime, send }: { runtime: RuntimeState; send: Send }) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<LapFileNotice | null>(null)
  const [opened, setOpened] = useState<OnTrackPage>(LIST_PAGE)
  const compare: CompareState | null = runtime.kind === 'ready' ? parseCompareState(runtime.sprint) : null
  const page = compare ? resolvePage(compare, opened) : LIST_PAGE
  usePageUp(page.kind === 'list' ? null : 'All laps', () => setOpened(LIST_PAGE))

  if (compare === null) {
    return (
      <div className="ontrack-page">
        <PageHeader title="On track" />
        <div className="card skeleton ontrack-hero-skeleton" />
        <div className="card skeleton ontrack-skeleton" />
      </div>
    )
  }

  const run = async (command: SprintCommand) => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That change could not be applied.')
    }
  }
  const importLap = async () => {
    setNotice(importNotice(await bridge.importLap()))
  }
  const toList = () => setOpened(LIST_PAGE)
  const openCompare = (from: LapKey | null) => {
    const opening = comparePair(compare, from)
    if (opening) setOpened({ kind: 'compare', ...opening })
  }
  const canCompare = comparePair(compare) !== null
  const lap = page.kind === 'lap' ? findLap(compare, page.lap) : null
  const first = page.kind === 'compare' ? findLap(compare, page.first) : null
  const second = page.kind === 'compare' ? findLap(compare, page.second) : null

  return (
    <div className="ontrack-page">
      <PageHeader title="On track">
        {page.kind === 'list' && (
          <>
            <button type="button" className="button" disabled={!canCompare} onClick={() => openCompare(null)}>
              <GitCompareArrows /> Compare…
            </button>
            {!compare.arranging && (
              <button type="button" className="button" onClick={() => void run(buildHudArrange(true))}>
                <Move /> Arrange HUD
              </button>
            )}
            <button
              type="button"
              className={compare.hudOpen ? 'button' : 'button primary'}
              disabled={!compare.hudOpen && compare.target === null}
              title={!compare.hudOpen && compare.target === null ? 'Open a lap and chase it first.' : undefined}
              onClick={() => void run(buildHudToggle())}
            >
              {compare.hudOpen ? <Square /> : <Play />} {compare.hudOpen ? 'Stop training' : 'Start training'}
            </button>
          </>
        )}
        {lap && (
          <>
            <button type="button" className="button" onClick={() => openCompare(lapKeyOf(lap))}>
              <GitCompareArrows /> Compare with…
            </button>
            {!isTarget(compare.target, lap) && (
              <button type="button" className="button primary" onClick={() => void run(buildSetTarget(lap))}>
                <Crosshair /> Chase this lap
              </button>
            )}
          </>
        )}
      </PageHeader>

      {compare.arranging && (
        <div className="infobar info" role="status">
          <span className="infobar-icon">i</span>
          <strong className="infobar-title">Arranging the HUD</strong>
          <span className="infobar-message">Move, resize, add or remove the windows on your monitor.</span>
          <button type="button" className="button" onClick={() => void run(buildHudArrange(false))}>
            <Check /> Done arranging
          </button>
        </div>
      )}

      {compare.fullscreen && (
        <div className="infobar warning" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">The HUD is hidden</strong>
          <span className="infobar-message">The game is in exclusive fullscreen. Switch it to borderless or windowed to see the HUD.</span>
        </div>
      )}

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

      {notice && (
        <div className={`infobar ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span className="infobar-icon">{notice.tone === 'error' ? '!' : 'i'}</span>
          <strong className="infobar-title">{notice.title}</strong>
          <span className="infobar-message">{notice.message}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {compare.courses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Route size={28} strokeWidth={1.5} />
            <h2>No laps to chase yet</h2>
            <p>Drive a lap and it appears here, or open a lap a friend sent you.</p>
            <button type="button" className="button" onClick={() => void importLap()}>
              <FolderOpen /> Import a friend’s lap…
            </button>
          </div>
        </div>
      ) : lap ? (
        <LapPage key={`${lap.sessionId}/${lap.lapNumber}`} compare={compare} lap={lap} onBack={toList} />
      ) : first && second ? (
        <ComparePage
          laps={drawableLaps(compare)}
          first={first}
          second={second}
          onBack={toList}
          onPick={(nextFirst, nextSecond) => setOpened({ kind: 'compare', first: nextFirst, second: nextSecond })}
        />
      ) : (
        <>
          <ChasingCard compare={compare} onCourse={(course) => void run(buildSelectCourse(course))} />
          <LapsCard compare={compare} onOpen={(open) => setOpened({ kind: 'lap', lap: lapKeyOf(open) })} onImport={() => void importLap()} />
        </>
      )}
    </div>
  )
}

/** The lap the HUD chases, big, and the track and car it is on. Change… lists the other courses. */
function ChasingCard({ compare, onCourse }: { compare: CompareState; onCourse: (course: CompareCourse) => void }) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const changeButton = useRef<HTMLButtonElement | null>(null)
  const facts = chasingFacts(compare, lapWhen)
  const course = compare.course
  const closeMenu = () => {
    setMenuAt(null)
    changeButton.current?.focus()
  }

  return (
    <section className="card ontrack-hero" aria-label="Chasing">
      <div className="ontrack-hero-main">
        {facts ? (
          <>
            <span className="ontrack-kicker">Chasing</span>
            <span className="ontrack-hero-time tabular">{formatLapSeconds(facts.lapTimeSeconds)}</span>
            <span className="ontrack-hero-detail">
              {facts.friend && <FriendBadge name={facts.friend} />}
              {[facts.detail, facts.versusBest].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : (
          <>
            <span className="ontrack-kicker">Chasing</span>
            <span className="ontrack-hero-none">No lap picked</span>
            <span className="ontrack-hero-detail">Open one of the laps below and chase it.</span>
          </>
        )}
      </div>
      {course && (
        <div className="ontrack-hero-course">
          <span>{course.trackCourse}</span>
          <span className="ontrack-hero-car">{course.carModel}</span>
          {compare.courses.length > 1 && (
            <button
              ref={changeButton}
              type="button"
              className="button subtle"
              aria-haspopup="menu"
              aria-expanded={menuAt !== null}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                setMenuAt({ x: box.right - COURSE_MENU_WIDTH, y: box.bottom + 4 })
              }}
            >
              Change…
            </button>
          )}
        </div>
      )}
      {menuAt && (
        <MenuLayer anchor={menuAt} label="Track and car" width={COURSE_MENU_WIDTH} onClose={closeMenu}>
          {compare.courses.map((option) => {
            const current = course !== null && courseKey(option) === courseKey(course)
            return (
              <button
                key={courseKey(option)}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className="menu-item ontrack-course-item"
                onClick={() => {
                  closeMenu()
                  if (!current) onCourse(option)
                }}
              >
                <span className="ontrack-course-check">{current && <Check />}</span>
                <span className="ontrack-course-name">
                  {option.trackCourse}
                  <span className="ontrack-course-car">{option.carModel}</span>
                </span>
              </button>
            )
          })}
        </MenuLayer>
      )}
    </section>
  )
}

const COURSE_MENU_WIDTH = 300

/**
 * The laps on this course, fastest first: your fastest few and every lap a friend shared, as a
 * table across the page. A row opens its lap; a lap with only a time has no line to open.
 */
function LapsCard({ compare, onOpen, onImport }: { compare: CompareState; onOpen: (lap: CorpusLap) => void; onImport: () => void }) {
  const laps = listedLaps(compare)
  const fastest = laps[0] ?? null
  const own = ownLapCount(compare)
  const ownListed = laps.filter((lap) => !lap.sharedFrom).length

  return (
    <section className="card list-card ontrack-laps" aria-label="Laps here">
      <div className="card-header">
        <h2 className="card-title">Laps here</h2>
        <button type="button" className="button subtle" onClick={onImport}>
          <FolderOpen /> Import a friend’s lap…
        </button>
      </div>
      {laps.length === 0 ? (
        <p className="list-card-empty">No laps on this track in this car yet. Drive one and it appears here.</p>
      ) : (
        <>
          <div className="ontrack-lap ontrack-table-head" aria-hidden="true">
            <span>Lap time</span>
            <span>Driver</span>
            <span>When</span>
            <span>Line for the HUD</span>
            <span className="ontrack-num">Gap</span>
            <span />
          </div>
          <div className="list-rows">
            {laps.map((lap) => {
              const chased = isTarget(compare.target, lap)
              return (
                <button
                  key={`${lap.sessionId}/${lap.lapNumber}`}
                  type="button"
                  disabled={!lap.hasChannels}
                  title={lap.unavailableReason ?? undefined}
                  className={`list-row ontrack-lap${chased ? ' selected' : ''}`}
                  onClick={() => onOpen(lap)}
                >
                  <span className="ontrack-lap-time tabular">{formatLapSeconds(lap.lapTimeSeconds)}</span>
                  <span className="ontrack-lap-name">
                    {lap.sharedFrom ? (
                      <>
                        <FriendBadge name={lap.sharedFrom} />
                        {lap.sharedFrom}
                      </>
                    ) : (
                      'You'
                    )}
                    {chased && <span className="chip chip-default">Chasing</span>}
                  </span>
                  <span className="ontrack-dim">{lap.sharedFrom ? sharedWhen(lap) : lapWhen(lap)}</span>
                  <span className="ontrack-dim">{lap.hasChannels ? 'Recorded' : 'Time only'}</span>
                  <span className="ontrack-num ontrack-dim tabular">
                    {lap === fastest ? 'fastest' : formatGap(lap.lapTimeSeconds - (fastest?.lapTimeSeconds ?? lap.lapTimeSeconds))}
                  </span>
                  <ChevronRight className="ontrack-row-chevron" />
                </button>
              )
            })}
          </div>
        </>
      )}
      {own > ownListed && (
        <p className="ontrack-more">
          Your {ownListed} fastest of {own} laps{laps.length > ownListed ? ' and every lap a friend shared' : ''}. Any other lap can be opened in Analysis.
        </p>
      )}
    </section>
  )
}

/** "Driven Fri, Oct 2": when a friend drove their lap. */
const sharedWhen = (lap: CorpusLap): string => (lap.sessionStartedAt ? `Driven ${shortDay(lap.sessionStartedAt)}` : 'Friend’s lap')
