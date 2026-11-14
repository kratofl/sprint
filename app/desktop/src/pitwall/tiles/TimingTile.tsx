import { useState } from 'react'
import { Flag } from 'lucide-react'
import type { FieldEntry } from '../pitWallData'
import { outCell } from '../raceControl'
import { carNumber, classShade, classesOf, compoundLetter, gapCell, isOut, lapClock, placesGained, sectorMarks, timingRows, timingSummary } from '../timing'
import { TileFrame, type FrameProps, type TileData } from '../tileFrame'

/** Places gained since the start: ▲2 green, ▼1 red, – none; blank outside a race. */
function Gained({ entry }: { entry: FieldEntry }) {
  const gained = placesGained(entry)
  if (gained === null) return <span />
  if (gained === 0) return <span className="pw-gain">–</span>
  return (
    <span className={gained > 0 ? 'pw-gain up' : 'pw-gain down'} aria-label={gained > 0 ? `${gained} places gained` : `${-gained} places lost`}>
      {gained > 0 ? '▲' : '▼'}
      {Math.abs(gained)}
    </span>
  )
}

/** The compound as a ringed letter, coloured by kind. */
export function TyreChip({ compound }: { compound: string | null }) {
  const letter = compoundLetter(compound)
  if (!letter) return <span />
  return (
    <span className={`pw-tyre t-${letter.toLowerCase()}`} title={compound ?? undefined}>
      {letter}
    </span>
  )
}

function PitCell({ entry }: { entry: FieldEntry }) {
  if (entry.inPit) return <span className="chip chip-warning">PIT</span>
  if (entry.pitState === 'Exiting') return <span className="chip chip-warning">OUT</span>
  return <span className="muted tabular">{entry.pitStops > 0 ? entry.pitStops : ''}</span>
}

/**
 * The field: a summary strip (lap, position, time left, last, best, overall best), then every car
 * with places gained, gaps, last lap and its sectors (purple the class best, green its own best).
 * A car shown blue gets a blue edge and a flag by its name, penalties to serve a red count, and a
 * car out of the race stays in its place dimmed, saying so where its gap was. The header filters
 * by class.
 */
export function TimingTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const [carClass, setCarClass] = useState<string | null>(null)
  const wall = data.pitWall
  const classes = wall ? classesOf(wall.field) : []
  const shownClass = carClass !== null && classes.includes(carClass) ? carClass : null
  const filter =
    classes.length > 1 ? (
      <span className="segmented pw-seg" role="radiogroup" aria-label="Class">
        {[null, ...classes].map((option) => (
          <button key={option ?? 'all'} type="button" role="radio" className="segmented-item" aria-checked={shownClass === option} onClick={() => setCarClass(option)}>
            {option ?? 'All'}
          </button>
        ))}
      </span>
    ) : null

  if (!wall) {
    return (
      <TileFrame frame={frame} title="Timing" />
    )
  }
  const summary = timingSummary(wall)
  const marks = sectorMarks(wall.field)
  const rows = timingRows(wall.field, shownClass)
  return (
    <TileFrame frame={frame} title="Timing" extra={filter} bodyClass="pw-flush pw-timing">
      <div className="pw-summary">
        {(
          [
            ['Lap', summary.lap],
            ['Position', summary.position],
            ['Time left', summary.timeLeft],
            ['Last lap', summary.lastLap],
            ['Best lap', summary.bestLap],
            ['Overall best', summary.overallBest],
          ] satisfies [string, string][]
        ).map(([label, value]) => (
          <div key={label}>
            <span className="muted">{label}</span>
            <b className="tabular">{value}</b>
          </div>
        ))}
      </div>
      <div className="pw-table" role="table" aria-label="Timing">
        <div className="pw-trow head" role="row">
          {['P', '+/−', '', '#', 'Driver', 'Tyre', 'Laps', 'Gap', 'Int', 'Last', 'S1', 'S2', 'S3', 'Best', 'Pit'].map((head, index) => (
            <span key={index} role="columnheader" className={index >= 6 && index <= 13 ? 'r' : index === 14 || index === 5 ? 'c' : undefined}>
              {head}
            </span>
          ))}
        </div>
        {rows.map((entry) => {
          const mark = marks.get(entry.id) ?? [null, null, null]
          const leader = entry.place === 1
          const out = isOut(entry)
          const rowClass = ['pw-trow', entry.isPlayer && 'you', entry.blueFlag && !out && 'blue', out && 'out'].filter(Boolean).join(' ')
          return (
            <div key={entry.id} role="row" className={rowClass}>
              <span className="tabular">{entry.place || '—'}</span>
              <Gained entry={entry} />
              <span className={`pw-classbar c${classShade(wall.field, entry.carClass)}`} aria-hidden="true" />
              <span className="tabular muted">{carNumber(entry)}</span>
              <span className="pw-driver">
                <span className="pw-ellipsis">{entry.driver}</span>
                {entry.blueFlag && !out && <Flag size={11} className="pw-blue" aria-label="Blue flag" />}
                {entry.penalties > 0 && !out && <span className="chip chip-danger">{entry.penalties} pen</span>}
              </span>
              <span className="c">
                <TyreChip compound={entry.compound} />
              </span>
              <span className="r tabular muted">{entry.lapsCompleted}</span>
              {out ? (
                <span className="pw-outcell tabular">{outCell(entry)}</span>
              ) : (
                <>
                  <span className="r tabular">{gapCell(entry.gapToLeader, entry.lapsToLeader, leader)}</span>
                  <span className="r tabular muted">{leader ? '' : gapCell(entry.gapToNext, entry.lapsToNext, false)}</span>
                </>
              )}
              <span className="r tabular">{out ? '—' : lapClock(entry.lastLap)}</span>
              {entry.lastSectors.map((time, index) => (
                <span key={index} className={`r tabular pw-sec ${out ? '' : (mark[index] ?? '')}`}>
                  {time === null || out ? '—' : time.toFixed(1)}
                </span>
              ))}
              <span className="r tabular muted">{lapClock(entry.bestLap)}</span>
              <span className="c">
                <PitCell entry={entry} />
              </span>
            </div>
          )
        })}
      </div>
    </TileFrame>
  )
}
