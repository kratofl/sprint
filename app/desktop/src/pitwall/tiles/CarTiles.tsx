import { useId } from 'react'
import type { LinkSample } from '../../bridge'
import type { CarDamage, PitWall, TyreCorner } from '../pitWallData'
import { brakeHeat, damageRows, dentOf, DENT_ZONES, pressureRange, PRESSURE_TARGET, ticksIn, tyreHeat, worstZone, type DentZone } from '../carDomain'
import { carAlongside } from '../stack'
import { carNumber, playerOf } from '../timing'
import { TileEmpty, TileFrame, type FrameProps, type TileData } from '../tileFrame'
import { useSize } from '../useSize'
import { CarSvg } from './CarSvg'
import { titled } from './RaceTiles'

const CORNER_NAME: Record<TyreCorner['position'], string> = { FrontLeft: 'FL', FrontRight: 'FR', RearLeft: 'RL', RearRight: 'RR' }

/**
 * One tyre drawn (ported from `corner2` in .dev/mockups/_pitwall3.py): the surface outer, middle
 * and inner across the tread (outer on the car's outside), the core in the middle, the brake
 * inboard, tread and pressure outboard, a tread bar under it.
 */
function TyreDrawing({ tyre }: { tyre: TyreCorner }) {
  const left = tyre.position === 'FrontLeft' || tyre.position === 'RearLeft'
  const bands = left
    ? [{ label: 'O', value: tyre.outer }, { label: 'M', value: tyre.middle }, { label: 'I', value: tyre.inner }]
    : [{ label: 'I', value: tyre.inner }, { label: 'M', value: tyre.middle }, { label: 'O', value: tyre.outer }]
  const tx = left ? 64 : 96
  const bx = left ? tx + 74 : tx - 22
  const sx = left ? tx - 12 : tx + 72
  const anchor = left ? 'end' : 'start'
  const clip = useId()
  const tread = Math.min(100, Math.max(0, tyre.wearPercent))
  return (
    <div className="pw-corner">
      <span className="pw-corner-name">{CORNER_NAME[tyre.position]}</span>
      <svg viewBox="0 0 220 154" role="img" aria-label={`${CORNER_NAME[tyre.position]}: core ${Math.round(tyre.core)}°, ${Math.round(tyre.pressureKPa)} kPa, ${Math.round(tread)}% tread`}>
        <clipPath id={clip}>
          <rect x={tx} y={22} width={60} height={116} rx={12} />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          {bands.map((band, index) => (
            <rect key={band.label} x={tx + index * 20} y={22} width={20} height={116} className={`pw-band ${tyreHeat(band.value)}`} />
          ))}
          <path d={`M${tx},70 h60 M${tx},100 h60`} className="pw-groove" />
        </g>
        {bands.map((band, index) => (
          <g key={band.label}>
            <text x={tx + index * 20 + 10} y={16} className="pw-t-lab">
              {band.label}
            </text>
            <text x={tx + index * 20 + 10} y={40} className="pw-t-val">
              {Math.round(band.value)}
            </text>
          </g>
        ))}
        <rect x={tx} y={22} width={60} height={116} rx={12} className="pw-t-out" />
        <rect x={tx + 12} y={64} width={36} height={34} rx={8} className={`pw-t-core ${tyreHeat(tyre.core)}`} />
        <text x={tx + 30} y={80} className="pw-t-core-val">
          {Math.round(tyre.core)}°
        </text>
        <text x={tx + 30} y={92} className="pw-t-small">
          core
        </text>
        <rect x={bx} y={48} width={8} height={64} rx={3} className={`pw-t-brake ${brakeHeat(tyre.brake)}`} />
        <text x={bx + 4} y={128} className="pw-t-val">
          {Math.round(tyre.brake)}°
        </text>
        <text x={bx + 4} y={140} className="pw-t-small">
          brake
        </text>
        <text x={sx} y={58} className="pw-t-big" textAnchor={anchor}>
          {Math.round(tread)}%
        </text>
        <text x={sx} y={72} className="pw-t-side" textAnchor={anchor}>
          tread
        </text>
        <text x={sx} y={104} className="pw-t-big" textAnchor={anchor}>
          {Math.round(tyre.pressureKPa)}
        </text>
        <text x={sx} y={118} className="pw-t-side" textAnchor={anchor}>
          kPa
        </text>
        <rect x={tx} y={146} width={60} height={4} rx={2} className="pw-t-tread" />
        <rect x={tx} y={146} width={(60 * tread) / 100} height={4} rx={2} className="pw-t-tread-fill" />
      </svg>
    </div>
  )
}

/** The four tyres round the car, and the colour key. */
export function TyresTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const tyres = wall?.car.tyres ?? []
  const compound = tyres[0]?.compound
  return (
    <TileFrame frame={frame} title={titled('Tyres', wall)} extra={compound ? <span className="muted">{compound}</span> : undefined} bodyClass="pw-tyres-body">
      {!wall || tyres.length < 4 ? (
        null
      ) : (
        <>
          <div className="pw-tyres">
            <TyreDrawing tyre={tyres[0]} />
            <div className="pw-tyres-car">
              <CarSvg label="The car" />
            </div>
            <TyreDrawing tyre={tyres[1]} />
            <TyreDrawing tyre={tyres[2]} />
            <TyreDrawing tyre={tyres[3]} />
          </div>
          <div className="pw-legend">
            <span>
              <i className="pw-key cold" />
              cold
            </span>
            <span>
              <i className="pw-key ok" />
              in window
            </span>
            <span>
              <i className="pw-key warm" />
              warm
            </span>
            <span>
              <i className="pw-key hot" />
              hot
            </span>
            <span className="muted">surface outer · middle · inner, core in the middle, brake inboard</span>
          </div>
        </>
      )}
    </TileFrame>
  )
}

const PRESSURE_SERIES = [
  { key: 'fl', label: 'FL' },
  { key: 'fr', label: 'FR' },
  { key: 'rl', label: 'RL' },
  { key: 'rr', label: 'RR' },
] as const satisfies readonly { key: 'fl' | 'fr' | 'rl' | 'rr'; label: string }[]

/** Each tyre's pressure per completed lap of this stint, against the target band. */
export function PressureTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const [ref, size] = useSize<HTMLDivElement>()
  const pressures = wall?.pressures ?? []
  const margin = { left: 34, right: 12, top: 10, bottom: 22 }
  const width = Math.max(0, size.width)
  const height = Math.max(0, size.height)
  const range = pressureRange(pressures)
  const first = pressures[0]?.lap ?? 0
  const last = pressures[pressures.length - 1]?.lap ?? 1
  const x = (lap: number) => margin.left + ((lap - first) / Math.max(1, last - first)) * (width - margin.left - margin.right)
  const y = (kpa: number) => margin.top + ((range.max - kpa) / Math.max(1, range.max - range.min)) * (height - margin.top - margin.bottom)
  const labelEvery = Math.max(1, Math.ceil(pressures.length / Math.max(1, Math.floor(width / 70))))
  return (
    <TileFrame frame={frame} title="Tyre pressure · this stint" bodyClass="pw-chart-body">
      {!wall ? (
        null
      ) : pressures.length < 2 ? (
        <TileEmpty title="Not enough laps yet" text="Each tyre’s pressure draws here once two laps of this stint are done." />
      ) : (
        <>
          <div className="pw-chart" ref={ref}>
            {width > 0 && height > 0 && (
              <svg width={width} height={height} role="img" aria-label="Tyre pressures over the stint">
                <rect x={margin.left} y={y(PRESSURE_TARGET.high)} width={width - margin.left - margin.right} height={y(PRESSURE_TARGET.low) - y(PRESSURE_TARGET.high)} className="pw-press-band" />
                {ticksIn(range, 5).map((tick) => (
                  <text key={tick} x={margin.left - 6} y={y(tick) + 4} className="pw-axis" textAnchor="end">
                    {tick}
                  </text>
                ))}
                {pressures.map((row, index) =>
                  index % labelEvery === 0 || index === pressures.length - 1 ? (
                    <text key={row.lap} x={x(row.lap)} y={height - 6} className="pw-axis" textAnchor="middle">
                      L{row.lap}
                    </text>
                  ) : null,
                )}
                {PRESSURE_SERIES.map((series) => (
                  <polyline
                    key={series.key}
                    points={pressures.map((row) => `${x(row.lap).toFixed(1)},${y(row[series.key]).toFixed(1)}`).join(' ')}
                    className={`pw-press-line ${series.key}`}
                  />
                ))}
              </svg>
            )}
          </div>
          <div className="pw-legend">
            {PRESSURE_SERIES.map((series) => (
              <span key={series.key}>
                <i className={`pw-line-key ${series.key}`} />
                {series.label}
              </span>
            ))}
            <span className="muted">
              band: target {PRESSURE_TARGET.low}–{PRESSURE_TARGET.high} kPa
            </span>
          </div>
        </>
      )}
    </TileFrame>
  )
}

/** Where each dent zone sits on the car drawing (200 × 424). */
const ZONE_RECT: Record<DentZone, { x: number; y: number; w: number; h: number }> = {
  frontLeft: { x: 0, y: 0, w: 70, h: 150 },
  front: { x: 70, y: 0, w: 60, h: 150 },
  frontRight: { x: 130, y: 0, w: 70, h: 150 },
  right: { x: 140, y: 150, w: 60, h: 130 },
  rearRight: { x: 130, y: 280, w: 70, h: 144 },
  rear: { x: 70, y: 280, w: 60, h: 144 },
  rearLeft: { x: 0, y: 280, w: 70, h: 144 },
  left: { x: 0, y: 150, w: 60, h: 130 },
}

function DamageCar({ damage }: { damage: CarDamage }) {
  const worst = worstZone(damage)
  const pin = worst ? ZONE_RECT[worst] : null
  return (
    <CarSvg
      label="Damage on the car"
      zones={DENT_ZONES.map((zone) => {
        const level = dentOf(damage, zone)
        const rect = ZONE_RECT[zone]
        return level > 0 ? <rect key={zone} x={rect.x} y={rect.y} width={rect.w} height={rect.h} className={`pw-dent l${level}`} /> : null
      })}
      extra={
        pin && damage.lastImpact ? (
          <g>
            <circle cx={pin.x + pin.w / 2} cy={pin.y + Math.min(46, pin.h / 2)} r={9} className="pw-hit" />
            <text x={pin.x + pin.w / 2} y={pin.y + Math.min(46, pin.h / 2) + 4} className="pw-hit-num">
              1
            </text>
          </g>
        ) : null
      }
    />
  )
}

/** Damage shaded on the car, what it is by side, and the last hit. */
export function DamageTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  const damage = wall?.car.damage ?? null
  return (
    <TileFrame frame={frame} title={titled('Damage', wall)} bodyClass="pw-damage">
      {!wall ? (
        null
      ) : !damage ? (
        <TileEmpty title="No damage data" text="The driver’s game does not report damage for this car." />
      ) : (
        <>
          <div className="pw-damage-car">
            <DamageCar damage={damage} />
          </div>
          <div className="pw-damage-list">
            {damageRows(damage).map((row) => (
              <div key={row.label} className="pw-damage-row">
                <span className="muted">{row.label}</span>
                <span>
                  <i className={`pw-sev s${row.severity}`} aria-hidden="true" />
                  {row.word}
                </span>
              </div>
            ))}
            {damage.lastImpact && (
              <div className="pw-damage-hit">
                <span className="pw-hit-badge" aria-hidden="true">
                  1
                </span>
                <span>Last hit{damage.lastImpact.lap !== null ? ` · lap ${damage.lastImpact.lap}` : ''}</span>
              </div>
            )}
          </div>
        </>
      )}
    </TileFrame>
  )
}

/** Units on the radar per metre; the radar shows ±15 m sideways and ±20 m lengthwise. */
const RADAR_SCALE = 4

/** Our car in the middle, the cars round it; one alongside goes yellow with an arc on its side. */
export function RadarTile({ data, frame }: { data: TileData; frame: FrameProps }) {
  const wall = data.pitWall
  return (
    <TileFrame frame={frame} title={titled('Radar', wall)} bodyClass="pw-radar-body">
      {wall && <Radar wall={wall} latest={data.latest} />}
    </TileFrame>
  )
}

function Radar({ wall, latest }: { wall: PitWall; latest: LinkSample | null }) {
  const nearest = [...wall.radar].sort((a, b) => Math.hypot(a.right, a.ahead) - Math.hypot(b.right, b.ahead))[0]
  const alongside = carAlongside(wall.radar)
  const side = nearest && alongside ? (nearest.right >= 0 ? 1 : -1) : 0
  const entry = nearest ? wall.field.find((car) => car.id === nearest.id) : undefined
  const speed = latest && latest.speedKph > 10 ? latest.speedKph / 3.6 : null
  // The timing gap when both cars are on the same lap; otherwise the distance over our speed.
  const player = playerOf(wall.field)
  const timed = entry && player && entry.lapsToLeader === player.lapsToLeader ? Math.abs(entry.gapToLeader - player.gapToLeader) : null
  const gap = nearest
    ? timed !== null
      ? `${timed.toFixed(1)} s`
      : speed !== null
        ? `${(Math.abs(nearest.ahead) / speed).toFixed(1)} s`
        : `${Math.round(Math.abs(nearest.ahead))} m`
    : ''
  const label = nearest ? `#${entry ? carNumber(entry) : nearest.id} · ${gap}` : 'Clear'
  return (
    <svg className="pw-radar" viewBox="-60 -80 120 160" role="img" aria-label={nearest ? `Nearest car ${label}` : 'No car near'}>
      <circle r={70} className="pw-radar-ring" />
      <circle r={40} className="pw-radar-ring" />
      {wall.radar.map((car) => {
        const x = car.right * RADAR_SCALE
        const y = -car.ahead * RADAR_SCALE
        if (Math.abs(x) > 64 || Math.abs(y) > 84) return null
        const near = alongside && car === nearest
        return <rect key={car.id} x={x - 7} y={y - 14} width={14} height={28} rx={4} className={near ? 'pw-radar-car near' : 'pw-radar-car'} />
      })}
      <rect x={-7} y={-14} width={14} height={28} rx={4} className="pw-radar-you" />
      {side !== 0 && <path d={side > 0 ? 'M14 -20 A60 60 0 0 1 40 30' : 'M-14 -20 A60 60 0 0 0 -40 30'} className="pw-radar-warn" />}
      <text x={0} y={60} className="pw-radar-label">
        {label}
      </text>
    </svg>
  )
}
