import { useState } from 'react'
import { Lock, Move, Play, Route, Square, X } from 'lucide-react'
import type { SprintCommand } from '../bridge'
import { PageHeader } from '../shell/PageHeader'
import type { RuntimeState } from '../shell/runtime'
import { Status } from '../shell/Status'
import { formatGap, formatLapSeconds } from './AnalysisDomain'
import type { CorpusLap } from './AnalysisDomain'
import {
  HUD_CHART_ORDER,
  HUD_READING_LABELS,
  buildHudLock,
  buildHudToggle,
  buildSelectCourse,
  buildSetTarget,
  buildToggleReading,
  courseKey,
  courseLabel,
  isTarget,
  parseCompareState,
  parseHudReadings,
  readingCount,
} from './OnTrackDomain'
import type { CompareState, HudReadings } from './OnTrackDomain'
import { Switch } from './SettingsLayout'
import './OnTrackView.css'

type Send = (command: SprintCommand) => Promise<void>

/**
 * On track: training against an older lap (docs/internals/live-compare.md). Pick the lap, choose
 * what the HUD shows, then start — the HUD opens as small windows over the game, the target's
 * traces in blue running ahead of the car and yours in brand orange up to it. All of it is host
 * state (`state.compare`, `settings.liveCompare`); this view renders it and sends `compare.*`.
 */
export function OnTrackView({ runtime, send }: { runtime: RuntimeState; send: Send }) {
  const [actionError, setActionError] = useState<string | null>(null)

  if (runtime.kind === 'loading') {
    return (
      <div className="ontrack-page">
        <PageHeader title="On track" />
        <div className="ontrack-grid">
          <div className="card skeleton ontrack-skeleton" />
          <div className="card skeleton ontrack-skeleton" />
        </div>
      </div>
    )
  }

  const compare: CompareState = parseCompareState(runtime.sprint)
  const readings = parseHudReadings(runtime.sprint)
  const run = async (command: SprintCommand) => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That change could not be applied.')
    }
  }

  return (
    <div className="ontrack-page">
      <PageHeader title="On track">
        {compare.hudOpen && (
          <button type="button" className="button subtle" onClick={() => void run(buildHudLock(!readings.locked))}>
            {readings.locked ? <Move /> : <Lock />} {readings.locked ? 'Unlock HUD layout' : 'Lock HUD layout'}
          </button>
        )}
        <button
          type="button"
          className={compare.hudOpen ? 'button' : 'button primary'}
          disabled={!compare.hudOpen && compare.target === null}
          title={!compare.hudOpen && compare.target === null ? 'Pick a lap to train against first.' : undefined}
          onClick={() => void run(buildHudToggle())}
        >
          {compare.hudOpen ? <Square /> : <Play />} {compare.hudOpen ? 'Stop training' : 'Start training'}
        </button>
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

      {compare.fullscreen && (
        <div className="infobar warning" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">The HUD is hidden</strong>
          <span className="infobar-message">The game is in exclusive fullscreen. Switch it to borderless or windowed to see the HUD.</span>
        </div>
      )}

      {compare.courses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Route size={28} strokeWidth={1.5} />
            <h2>No laps to train against yet</h2>
            <p>Drive a lap and it appears here. Every valid lap from now on carries the traces the HUD draws.</p>
          </div>
        </div>
      ) : (
        <div className="ontrack-grid">
          <TargetCard
            compare={compare}
            onCourse={(key) => {
              const course = compare.courses.find((candidate) => courseKey(candidate) === key)
              if (course) void run(buildSelectCourse(course))
            }}
            onPick={(lap) => void run(buildSetTarget(lap))}
          />
          <HudCard readings={readings} hudOpen={compare.hudOpen} onToggle={(id) => void run(buildToggleReading(readings, id))} />
        </div>
      )}
    </div>
  )
}

/** The laps on one course, fastest first; the one picked is what the HUD chases. */
function TargetCard({
  compare,
  onCourse,
  onPick,
}: {
  compare: CompareState
  onCourse: (key: string) => void
  onPick: (lap: CorpusLap) => void
}) {
  const best = compare.laps[0] ?? null
  return (
    <section className="card list-card" aria-label="Train against">
      <div className="card-header">
        <h2 className="card-title">Train against</h2>
        {compare.course && compare.courses.length > 1 ? (
          <select aria-label="Track and car" value={courseKey(compare.course)} onChange={(event) => onCourse(event.target.value)}>
            {compare.courses.map((course) => (
              <option key={courseKey(course)} value={courseKey(course)}>
                {courseLabel(course)}
              </option>
            ))}
          </select>
        ) : (
          compare.course && <span className="muted">{courseLabel(compare.course)}</span>
        )}
      </div>
      {compare.laps.length === 0 ? (
        <p className="list-card-empty">No laps on this track in this car yet. Drive one and it appears here.</p>
      ) : (
        <div className="list-rows" role="radiogroup" aria-label="Lap to train against">
          {compare.laps.map((lap) => {
            const picked = isTarget(compare.target, lap)
            return (
              <label
                key={`${lap.sessionId}/${lap.lapNumber}`}
                className={`list-row ontrack-lap${picked ? ' selected' : ''}${lap.hasChannels ? '' : ' unavailable'}`}
                title={lap.unavailableReason ?? undefined}
              >
                <input type="radio" name="ontrack-target" checked={picked} disabled={!lap.hasChannels} onChange={() => onPick(lap)} />
                <span className="ontrack-lap-time tabular">{formatLapSeconds(lap.lapTimeSeconds)}</span>
                <span className="ontrack-lap-detail">
                  {lapWhen(lap)}
                  {best && (
                    <span className="muted tabular">
                      {' · '}
                      {lap === best ? 'fastest' : formatGap(lap.lapTimeSeconds - best.lapTimeSeconds)}
                    </span>
                  )}
                </span>
                <Status tone={lap.hasChannels ? 'success' : 'neutral'} quiet>
                  {lap.hasChannels ? 'Full trace' : 'Time only'}
                </Status>
              </label>
            )
          })}
        </div>
      )}
      {compare.lapCount > compare.laps.length && (
        <p className="ontrack-more muted">
          The {compare.laps.length} fastest of {compare.lapCount} laps. Any other lap can be picked in Analysis.
        </p>
      )}
    </section>
  )
}

/** "Lap 5 · Mon, Sep 28", or who shared it. */
function lapWhen(lap: CorpusLap): string {
  if (lap.sharedFrom) return `${lap.sharedFrom} · shared lap`
  if (!lap.sessionStartedAt) return `Lap ${lap.lapNumber}`
  const day = new Date(lap.sessionStartedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `Lap ${lap.lapNumber} · ${day}`
}

/** Which readings get a HUD window. The last one cannot be turned off: a HUD of nothing is refused. */
function HudCard({
  readings,
  hudOpen,
  onToggle,
}: {
  readings: HudReadings
  hudOpen: boolean
  onToggle: (id: 'delta' | (typeof HUD_CHART_ORDER)[number]) => void
}) {
  const rows = [
    { id: 'delta' as const, on: readings.showDelta },
    ...HUD_CHART_ORDER.map((id) => ({ id, on: readings.panelIds.includes(id) })),
  ]
  const last = readingCount(readings) === 1
  return (
    <section className="card list-card" aria-label="HUD">
      <div className="card-header">
        <h2 className="card-title">HUD</h2>
        {hudOpen && (
          <Status tone="success" quiet>
            {readings.locked ? 'Showing · locked' : 'Showing · drag to place'}
          </Status>
        )}
      </div>
      <div className="list-rows">
        {rows.map((row) => (
          <div key={row.id} className="list-row static ontrack-reading">
            <span id={`ontrack-reading-${row.id}`}>{HUD_READING_LABELS[row.id]}</span>
            <Switch
              checked={row.on}
              disabled={last && row.on}
              onChange={() => onToggle(row.id)}
              aria-labelledby={`ontrack-reading-${row.id}`}
              aria-describedby="ontrack-hud-note"
            />
          </div>
        ))}
      </div>
      <p id="ontrack-hud-note" className="ontrack-more muted">
        Run the game borderless or windowed: exclusive fullscreen hides the HUD.
      </p>
    </section>
  )
}
