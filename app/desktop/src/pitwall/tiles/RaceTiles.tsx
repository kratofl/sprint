import { CloudRain, Sun, Thermometer } from 'lucide-react'
import { headlineTarget, targetSummary } from '../../views/SessionPlannerDomain'
import type { PitWall } from '../pitWallData'
import { liveDelta } from '../carDomain'
import { planStints, range, stintRows, strategy } from '../fuel'
import { carNumber, classShade, lapClock, lapsLeft, playerOf, relativeRows, signed } from '../timing'
import { TileEmpty, TileFrame, type FrameProps, type TileData } from '../tileFrame'
import { useTraces } from '../useTraces'
import { FlagStrip } from './ControlTiles'

const SESSION_WORD: Record<PitWall['session']['sessionType'], string> = {
  Practice: 'Practice',
  Qualify: 'Qualifying',
  Race: 'Race',
  Warmup: 'Warm-up',
  Unknown: 'Session',
}

const percent = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)} %`)
const degrees = (value: number | null): string => (value === null ? '—' : `${Math.round(value)}°`)

/** "#63 · E. Varga": the car the wall follows, for tile titles. */
export const ourCar = (pitWall: PitWall | null): string => {
  const player = pitWall ? playerOf(pitWall.field) : null
  return player ? `#${carNumber(player)}` : ''
}

/** A tile's title with our car: "Relative · #63". */
export const titled = (name: string, pitWall: PitWall | null): string => {
  const car = ourCar(pitWall)
  return car ? `${name} · ${car}` : name
}

/** The session strip across the top: where and what, race control's flag, track and air, grip and rain now. */
export function SessionTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  return (
    <TileFrame frame={frame} title="Session" bare bodyClass="pw-session-body">
      {wall && (
        <>
          <div className="pw-session-main">
            <b>
              {wall.plan?.name ?? wall.session.track} · {SESSION_WORD[wall.session.sessionType]}
            </b>
            <span className="muted">
              {wall.session.track}
              {wall.session.trackLengthMeters !== null && ` · ${(wall.session.trackLengthMeters / 1000).toFixed(1)} km`}
            </span>
          </div>
          <FlagStrip wall={wall} />
          <div className="pw-session-fact">
            <span className="muted">
              <Thermometer size={13} aria-hidden="true" /> Track
            </span>
            <b className="tabular">{degrees(wall.session.trackTemp)}</b>
          </div>
          <div className="pw-session-fact">
            <span className="muted">Air</span>
            <b className="tabular">{degrees(wall.session.airTemp)}</b>
          </div>
          {wall.session.gripLevel !== null && (
            <div className="pw-session-fact" title="The game’s own grip level">
              <span className="muted">Grip</span>
              <b className="tabular">Level {wall.session.gripLevel}</b>
            </div>
          )}
          <div className="pw-session-fact">
            <span className="muted">Now</span>
            <b>
              {wall.session.raining !== null && wall.session.raining > 0.05 ? <CloudRain size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
              {wall.session.raining !== null && wall.session.raining > 0.05 ? `Rain ${percent(wall.session.raining)}` : 'Dry'} · {percent(wall.session.wetness)} wet
            </b>
          </div>
        </>
      )}
    </TileFrame>
  )
}

/** The cars round ours on the road, ahead on top. */
export function RelativeTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const rows = wall ? relativeRows(wall.field) : []
  return (
    <TileFrame frame={frame} title={titled('Relative', wall)} bodyClass="pw-flush">
      {!wall ? (
        null
      ) : rows.length === 0 ? (
        <TileEmpty title="No lap time yet" text="The relative needs a lap to measure the gaps in." />
      ) : (
        <ul className="pw-rel">
          {rows.map((row) => (
            <li key={row.entry.id} className={row.entry.isPlayer ? 'pw-rel-row you' : 'pw-rel-row'}>
              <span className="tabular pw-num">{row.entry.isPlayer ? '' : signed(row.seconds)}</span>
              <span className={`pw-classbar c${classShade(wall.field, row.entry.carClass)}`} aria-hidden="true" />
              <span className="tabular muted">{carNumber(row.entry)}</span>
              <span className="pw-ellipsis">{row.entry.driver}</span>
              <span className="muted pw-note">{row.note ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
    </TileFrame>
  )
}

/** The plan's stints round the lap now: done, this one and when to box, the next ones. */
export function StintTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const player = wall ? playerOf(wall.field) : null
  const stints = wall?.planFuel && player ? planStints(wall.planFuel, player.lapsCompleted) : null
  const box = wall && player ? strategy(wall.car, player.lapsCompleted, null)?.boxLap ?? null : null
  const compound = wall?.car.tyres[0]?.compound
  return (
    <TileFrame frame={frame} title={wall?.plan ? 'Stint plan · from the session plan' : 'Stint plan'}>
      {!wall ? (
        null
      ) : !wall.plan ? (
        <TileEmpty title="No session plan shared" text="The driver shares one from the Session planner; then the stints, targets and practice laps show here." />
      ) : !stints ? (
        <TileEmpty title="No stints in the plan yet" text="The Session planner cuts the race into stints once it has the race length, the fuel per lap and the tank, from laps in this car." />
      ) : (
        <>
          <div className="pw-stint-bar" aria-hidden="true">
            {stints.map((stint) => (
              <span key={stint.number} className={stint.state} style={{ flex: stint.lastLap - stint.firstLap + 1 }} />
            ))}
          </div>
          <ul className="pw-stints">
            {stintRows(stints).map((row) => (
              <li key={row.label} className={`pw-stint ${row.state}`}>
                <span className="tabular">{row.label}</span>
                <span className="tabular">
                  {row.firstLap} – {row.lastLap}
                </span>
                <span className="muted pw-right tabular">
                  {row.state === 'done'
                    ? `Done · ${row.lastLap - row.firstLap + 1} laps`
                    : row.state === 'current'
                      ? `Lap ${(player?.lapsCompleted ?? 0) + 1}${box !== null ? ` · box lap ${Math.min(box, row.lastLap)}` : ''}${compound ? ` · ${compound}` : ''}`
                      : row.count > 1
                        ? `${row.count} stops`
                        : `fill ${Math.ceil(row.liters)} L`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </TileFrame>
  )
}

function Meter({ label, value, detail, fraction, note }: { label: string; value: string; detail: string; fraction: number | null; note?: string }) {
  return (
    <div className="pw-meter">
      <span className="muted">{label}</span>
      <span className="pw-meter-value">
        <b className="tabular">{value}</b>
        <span className="muted tabular">{detail}</span>
      </span>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction ?? 0)) * 100)}%` }} />
      </div>
      {note && <span className="pw-meter-note">{note}</span>}
    </div>
  )
}

/** Fuel, virtual energy and battery; what runs out first; when to box and what is left at the flag. */
export function FuelTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  if (!wall) {
    return (
      <TileFrame frame={frame} title="Fuel & energy" />
    )
  }
  const { car, plan } = wall
  const player = playerOf(wall.field)
  const reach = range(car)
  const left = lapsLeft(wall)
  const plan_ = player ? strategy(car, player.lapsCompleted, left) : null
  const laps = (value: number | null): string => (value === null ? '—' : `${value.toFixed(1)} laps`)
  const fill = car.fuelCapacityLiters !== null ? `fill ${Math.round(car.fuelCapacityLiters)} L${car.virtualEnergy !== null ? ' · VE 100 %' : ''}` : ''
  return (
    <TileFrame frame={frame} title={titled('Fuel & energy', wall)} bodyClass="pw-fuel">
      <div className="pw-meters">
        <Meter
          label="Fuel"
          value={`${car.fuelLiters.toFixed(1)} L`}
          detail={laps(reach.fuelLaps)}
          fraction={car.fuelCapacityLiters ? car.fuelLiters / car.fuelCapacityLiters : null}
          note={reach.limit === 'fuel' ? 'Runs out first' : undefined}
        />
        {car.virtualEnergy !== null && (
          <Meter label="Virtual energy" value={percent(car.virtualEnergy)} detail={laps(reach.energyLaps)} fraction={car.virtualEnergy} note={reach.limit === 'energy' ? 'Runs out first' : undefined} />
        )}
        {car.battery !== null && <Meter label="Battery" value={percent(car.battery)} detail="charge" fraction={car.battery} />}
      </div>
      <dl className="pw-facts">
        <div className="pw-fuel-per-lap">
          <dt>Per lap</dt>
          <dd className="tabular">
            {car.fuelPerLapLiters > 0 ? `${car.fuelPerLapLiters.toFixed(2)} L` : '—'}
            {car.virtualEnergyPerLap !== null && ` · ${(car.virtualEnergyPerLap * 100).toFixed(1)} % VE`}
          </dd>
          <dd className="muted tabular">{plan?.fuelPerLapLiters ? `target ${plan.fuelPerLapLiters.toFixed(2)} L` : ''}</dd>
        </div>
        <div>
          <dt>Strategy</dt>
          <dd className="tabular">
            {!plan_
              ? '—'
              : plan_.stopsLeft === null
                ? `Box in ≈${Math.max(0, plan_.boxLap - (player?.lapsCompleted ?? 0))} laps`
                : `Box lap ${plan_.boxLap} · ${plan_.stopsLeft} ${plan_.stopsLeft === 1 ? 'stop' : 'stops'} left`}
          </dd>
          <dd className="muted tabular">{plan_?.stopsLeft ? fill : ''}</dd>
        </div>
        <div>
          <dt>To the flag</dt>
          <dd className="tabular">
            {plan_?.spareLaps === null || plan_?.spareLaps === undefined
              ? 'needs the race length'
              : plan_.spareLaps >= 0
                ? `+${plan_.spareLaps.toFixed(1)} laps spare`
                : `${Math.abs(plan_.spareLaps).toFixed(1)} laps short`}
          </dd>
          <dd className="muted tabular">{left !== null ? `${Math.ceil(left)} laps left` : ''}</dd>
        </div>
      </dl>
    </TileFrame>
  )
}

/**
 * The target lap from the plan and the live gap to it (from the two traces), the last lap's
 * sectors against the car's best, and the last lap against the target. Without a plan: the
 * best lap so far.
 */
export function TargetTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const target = wall?.plan ? headlineTarget(wall.plan) : null
  const traces = useTraces(['current', 'target'], target !== null)
  const player = wall ? playerOf(wall.field) : null
  if (!wall || !player) {
    return (
      <TileFrame frame={frame} title="Target lap" />
    )
  }
  if (!target) {
    return (
      <TileFrame frame={frame} title={titled('Target lap', wall)}>
        <TileEmpty
          title={`Best lap so far: ${lapClock(player.bestLap)}`}
          text={wall.plan ? 'The shared plan has no target lap yet; this compares to the driver’s best this session.' : 'Without a plan there are no targets; this compares to the driver’s best this session.'}
        />
      </TileFrame>
    )
  }
  const live = traces.current && traces.target ? liveDelta(traces.current, traces.target, wall.session.trackLengthMeters) : null
  const tone = (value: number | null) => (value === null ? 'muted' : value <= 0 ? 'good' : 'bad')
  const sector = (index: 0 | 1 | 2) => {
    const last = player.lastSectors[index]
    const best = player.bestSectors[index]
    return last !== null && best !== null ? last - best : null
  }
  const lastGap = player.lastLap !== null ? player.lastLap - target.lapTimeSeconds : null
  return (
    <TileFrame frame={frame} title={titled('Target lap', wall)} bodyClass="pw-target">
      <div className="pw-target-top">
        <div>
          <span className="muted">Target · {targetSummary(target).toLowerCase()}</span>
          <b className="pw-big tabular">{lapClock(target.lapTimeSeconds)}</b>
        </div>
        <div>
          <span className="muted">Live</span>
          <b className={`pw-big tabular ${tone(live)}`}>{live === null ? '—' : signed(live, 2)}</b>
        </div>
      </div>
      <div className="pw-target-secs" title="The last lap’s sectors against the car’s best">
        {([0, 1, 2] as const).map((index) => {
          const gap = sector(index)
          return (
            <div key={index}>
              <span className="muted">S{index + 1}</span>
              <b className={`tabular ${tone(gap)}`}>{gap === null ? '—' : signed(gap, 2)}</b>
            </div>
          )
        })}
      </div>
      <div className="pw-target-last">
        <span className="muted">Last lap</span>
        <b className="tabular">
          {lapClock(player.lastLap)} {lastGap !== null && <span className={tone(lastGap)}>{signed(lastGap)}</span>}
        </b>
      </div>
    </TileFrame>
  )
}
