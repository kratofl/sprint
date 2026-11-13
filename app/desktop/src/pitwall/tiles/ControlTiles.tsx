import type { FieldEntry, PitWall } from '../pitWallData'
import { strategy } from '../fuel'
import { pitLossTotal, rejoin, trafficText, type Near } from '../pitStop'
import { feedLines, flagState, stoppedCars, stoppedSummary, type FlagState } from '../raceControl'
import { carNumber, classesOf, lapsLeft, playerOf, signed } from '../timing'
import { TileEmpty, TileFrame, type FrameProps, type TileData } from '../tileFrame'

/** The session's flag as a pill: "Green", "Yellow · S2", "Full course yellow", "Red flag". */
export function FlagPill({ state }: { state: FlagState }) {
  return <span className={`pw-flag ${state.tone}`}>{state.label}</span>
}

/** The header's race control strip: the flag, the three sectors (yellow where one is out) and a stopped car. */
export function FlagStrip({ wall }: { wall: PitWall }) {
  const state = flagState(wall.session)
  const stopped = stoppedSummary(stoppedCars(wall))
  return (
    <div className="pw-flags" aria-label="Race control">
      <FlagPill state={state} />
      <span className="pw-flag-sectors">
        {state.sectors.map((yellow, index) => (
          <span key={index} className={yellow ? 'pw-flag-sector yellow' : 'pw-flag-sector'} aria-label={`Sector ${index + 1}${yellow ? ': yellow' : ''}`}>
            S{index + 1}
          </span>
        ))}
      </span>
      {stopped && <span className="muted pw-ellipsis">{stopped}</span>}
    </div>
  )
}

/** Race control: the flag now, then everything that changed, newest first. */
export function RaceControlTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  if (!wall) return <TileFrame frame={frame} title="Race control" />
  const lines = feedLines(wall)
  return (
    <TileFrame frame={frame} title="Race control" extra={<FlagPill state={flagState(wall.session)} />} bodyClass="pw-flush">
      {lines.length === 0 ? (
        <TileEmpty title="Nothing yet" text="Flag changes, yellows, stopped cars, penalties, blue flags and retirements show here as they happen." />
      ) : (
        <ul className="pw-feed">
          {lines.map((line) => (
            <li key={line.key} className="pw-feed-row">
              <span className="tabular muted">{line.time}</span>
              <i className={`pw-feed-dot ${line.tone}`} aria-hidden="true" />
              <span className="pw-ellipsis">{line.text}</span>
              <span className="muted pw-note tabular">{line.note}</span>
            </li>
          ))}
        </ul>
      )}
    </TileFrame>
  )
}

/** "#88", or "#88 GT3" when it races in another class than ours. */
const nameIn = (player: FieldEntry) => (entry: FieldEntry): string => (entry.carClass && entry.carClass !== player.carClass ? `#${carNumber(entry)} ${entry.carClass}` : `#${carNumber(entry)}`)

const between = (ahead: Near | null, behind: Near | null, name: (entry: FieldEntry) => string): string =>
  [ahead && `${name(ahead.entry)} (${signed(ahead.seconds)} s)`, behind && `${name(behind.entry)} (${signed(behind.seconds)} s)`].filter(Boolean).join(' and ')

/**
 * The pit stop: what one costs (the measured lane and standing time) and where our car rejoins
 * if it boxes this lap, next lap or on the lap the fuel says.
 */
export function PitStopTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const player = wall ? playerOf(wall.field) : null
  if (!wall || !player) return <TileFrame frame={frame} title="Pit stop" />
  const title = `Pit stop · #${carNumber(player)}`
  const { pitLoss } = wall
  const loss = pitLossTotal(pitLoss)
  if (pitLoss.lane === null) {
    return (
      <TileFrame frame={frame} title={title}>
        <TileEmpty title="No pit stop seen yet" text="The loss is measured from this session’s stops: the lane from every car’s, the standing time from ours." />
      </TileFrame>
    )
  }
  if (loss === null) {
    return (
      <TileFrame frame={frame} title={title}>
        <TileEmpty title={`Lane loss ${pitLoss.lane.toFixed(1)} s`} text={`The standing time needs a stop by us or another ${player.carClass || 'car of our class'}.`} />
      </TileFrame>
    )
  }
  const name = nameIn(player)
  const lap = player.lapsCompleted + 1
  const box = strategy(wall.car, player.lapsCompleted, lapsLeft(wall))?.boxLap ?? null
  const options = [
    { label: `Lap ${lap} · now`, inLaps: 0 },
    { label: `Lap ${lap + 1}`, inLaps: 1 },
    ...(box !== null && box > lap + 1 ? [{ label: `Lap ${box} · box lap`, inLaps: box - lap }] : []),
  ]
  const now = rejoin(wall.field, loss, 0)
  const inClass = classesOf(wall.field).length > 1 ? 'In class · ' : ''
  return (
    <TileFrame frame={frame} title={title} bodyClass="pw-pitstop">
      <div className="pw-target-top">
        <div>
          <span className="muted">Pit loss</span>
          <b className="pw-big tabular">{loss.toFixed(1)} s</b>
          <span className="muted tabular">
            lane {pitLoss.lane.toFixed(1)} s + stop {(pitLoss.standing ?? 0).toFixed(1)} s
          </span>
        </div>
        {now && (
          <div>
            <span className="muted">Box this lap</span>
            <b className="pw-big tabular">Rejoin P{now.classPlace}</b>
            <span className="muted tabular">
              {inClass}
              {between(now.ahead, now.behind, name) || 'nobody of our class near'}
            </span>
          </div>
        )}
      </div>
      <div className="pw-pit-table" role="table" aria-label="Where a stop rejoins">
        <div className="pw-pit-row head" role="row">
          <span role="columnheader">Box on</span>
          <span role="columnheader">Rejoin</span>
          <span role="columnheader">Traffic</span>
        </div>
        {options.map((option) => {
          const after = rejoin(wall.field, loss, option.inLaps)
          return (
            <div key={option.label} className="pw-pit-row" role="row">
              <span className="tabular">{option.label}</span>
              <span className="tabular">{after ? `P${after.classPlace}` : '—'}</span>
              <span className="pw-ellipsis muted">{after ? trafficText(after.traffic, name) : '—'}</span>
            </div>
          )
        })}
      </div>
      <span className="muted pw-note">
        Lane loss from {pitLoss.laneStops} {pitLoss.laneStops === 1 ? 'stop' : 'stops'} this session · stop time from{' '}
        {pitLoss.standingFromOwn ? `#${carNumber(player)}’s own ${pitLoss.standingStops === 1 ? 'stop' : 'stops'}` : `${pitLoss.standingStops} ${player.carClass} ${pitLoss.standingStops === 1 ? 'stop' : 'stops'}`}
      </span>
    </TileFrame>
  )
}
