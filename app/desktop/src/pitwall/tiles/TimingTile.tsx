import { Fragment, useState, type ReactNode } from 'react'
import { Flag } from 'lucide-react'
import { ClassTag } from '../../views/CarBadges'
import type { FieldEntry } from '../pitWallData'
import { outCell } from '../raceControl'
import { carName, carNumber, classLabel, classMark, classesOf, compoundLetter, gapCell, inYellow, isOut, lapClock, placesGained, sectorMarks, timingRows, timingSummary, type SectorMark } from '../timing'
import { gridTemplate, outNoteAt, TIMING_COLUMN_SPECS, type TimingColumn } from '../timingColumns'
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

/** What a row's cells read besides the car: the field, its sector marks, and the shown columns. */
type RowContext = { field: readonly FieldEntry[]; marks: readonly [SectorMark, SectorMark, SectorMark]; out: boolean; yellow: boolean; columns: readonly TimingColumn[] }

/** One column's cell (three for the sector columns); nothing for Int when an out car's note in Gap spans it. */
function Cell({ column, entry, row }: { column: TimingColumn; entry: FieldEntry; row: RowContext }): ReactNode {
  const { out } = row
  switch (column) {
    case 'place':
      return <span className="tabular">{entry.place || '—'}</span>
    case 'gained':
      return <Gained entry={entry} />
    case 'classBar':
      return <span className={`pw-classbar ${classMark(row.field, entry.carClass)}`} aria-hidden="true" />
    case 'number':
      return <span className="tabular muted">{carNumber(entry)}</span>
    case 'driver':
      return (
        <span className="pw-driver">
          <span className="pw-ellipsis">{entry.driver}</span>
          {row.yellow && <Flag size={11} className="pw-yellow" aria-label={`In a yellow, sector ${entry.sector}`} />}
          {entry.blueFlag && !out && <Flag size={11} className="pw-blue" aria-label="Blue flag" />}
          {entry.stopped && !out && <span className="chip chip-warning">Stopped</span>}
          {/* With a Penalties column the count is there instead. */}
          {entry.penalties > 0 && !out && !row.columns.includes('penalties') && <span className="chip chip-danger">{entry.penalties} pen</span>}
        </span>
      )
    case 'tyre':
      return (
        <span className="c">
          <TyreChip compound={entry.compound} />
        </span>
      )
    case 'laps':
      return <span className="r tabular muted">{entry.lapsCompleted}</span>
    case 'gap':
    case 'interval': {
      const note = out ? outNoteAt(row.columns) : null
      if (note?.column === column) {
        return (
          <span className={note.span === 2 ? 'pw-outcell wide tabular' : 'pw-outcell tabular'} title={outCell(entry)}>
            {outCell(entry)}
          </span>
        )
      }
      if (out) return note?.span === 2 ? null : <span />
      if (column === 'gap') return <span className="r tabular">{gapCell(entry.gapToLeader, entry.lapsToLeader, entry.place === 1)}</span>
      return <span className="r tabular muted">{entry.place === 1 ? '' : gapCell(entry.gapToNext, entry.lapsToNext, false)}</span>
    }
    case 'last':
      return <span className="r tabular">{out ? '—' : lapClock(entry.lastLap)}</span>
    case 'lastSectors':
      return entry.lastSectors.map((time, index) => (
        <span key={index} className={`r tabular pw-sec ${out ? '' : (row.marks[index] ?? '')}`}>
          {time === null || out ? '—' : time.toFixed(1)}
        </span>
      ))
    case 'best':
      return <span className="r tabular muted">{lapClock(entry.bestLap)}</span>
    case 'pit':
      return (
        <span className="c">
          <PitCell entry={entry} />
        </span>
      )
    case 'classPlace':
      return <span className="r tabular">{entry.classPlace || '—'}</span>
    case 'classTag':
      return (
        <span className="pw-classtag">
          <ClassTag tag={entry.classTag} />
        </span>
      )
    case 'car':
      return <span className="pw-ellipsis muted">{carName(entry)}</span>
    case 'bestSectors':
      return entry.bestSectors.map((time, index) => (
        <span key={index} className="r tabular muted">
          {time === null ? '—' : time.toFixed(1)}
        </span>
      ))
    case 'start':
      return <span className="r tabular muted">{entry.startPlace ?? ''}</span>
    case 'penalties':
      return <span className="c">{entry.penalties > 0 && !out && <span className="chip chip-danger">{entry.penalties}</span>}</span>
  }
}

/**
 * The field: a summary strip (lap, position, time left, last, best, overall best), then every car
 * in the tile's own `columns` (timingColumns.ts): gaps, last lap and its sectors (purple the class
 * best, green its own best) and so on. A car shown blue gets a blue edge and a flag by its name,
 * one in a sector under a yellow a yellow edge and flag, one stopped on track a tag, penalties to
 * serve a red count, and a car out of the race stays in its place dimmed, saying so where its gap
 * was. The header filters by class.
 */
export function TimingTile({ data, frame, columns }: { data: TileData; frame: FrameProps; columns: readonly TimingColumn[] }) {
  const [carClass, setCarClass] = useState<string | null>(null)
  const wall = data.pitWall
  const classes = wall ? classesOf(wall.field) : []
  const shownClass = carClass !== null && classes.includes(carClass) ? carClass : null
  const filter =
    classes.length > 1 ? (
      <span className="segmented pw-seg" role="radiogroup" aria-label="Class">
        {[null, ...classes].map((option) => (
          <button key={option ?? 'all'} type="button" role="radio" className="segmented-item" aria-checked={shownClass === option} onClick={() => setCarClass(option)}>
            {option === null ? 'All' : classLabel(wall?.field ?? [], option)}
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
  const template = gridTemplate(columns)
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
        <div className="pw-trow head" role="row" style={{ gridTemplateColumns: template }}>
          {columns.flatMap((column) =>
            TIMING_COLUMN_SPECS[column].heads.map((head, index) => (
              <span key={`${column}-${index}`} role="columnheader" className={TIMING_COLUMN_SPECS[column].align ?? undefined} title={TIMING_COLUMN_SPECS[column].label}>
                {head}
              </span>
            )),
          )}
        </div>
        {rows.map((entry) => {
          const out = isOut(entry)
          const yellow = inYellow(entry, wall.session.yellowSectors)
          const rowClass = ['pw-trow', entry.isPlayer && 'you', yellow ? 'yellow' : entry.blueFlag && !out && 'blue', out && 'out'].filter(Boolean).join(' ')
          const row: RowContext = { field: wall.field, marks: marks.get(entry.id) ?? [null, null, null], out, yellow, columns }
          return (
            <div key={entry.id} role="row" className={rowClass} style={{ gridTemplateColumns: template }}>
              {columns.map((column) => (
                <Fragment key={column}>
                  <Cell column={column} entry={entry} row={row} />
                </Fragment>
              ))}
            </div>
          )
        })}
      </div>
    </TileFrame>
  )
}
