import type { PitWall } from '../pitWallData'
import { pitLossTotal, rejoin } from '../pitStop'
import { carNumber, classesOf, classShade, isOut, playerOf, sectorStarts } from '../timing'
import { TileFrame, type FrameProps, type TileData } from '../tileFrame'

// The circle track: the lap as a ring with every car on it by how far round it is (start/finish
// on the left, clockwise), the pit lane just inside, and the track's own outline in the middle.
// A sector under a local yellow turns yellow, a car stopped on track wears a halo, and in a race
// a hollow car marks where ours would come out if it boxed now. Geometry ported from the mockups
// (`ring_map` in .dev/mockups/_pitwall2.py, `ring5` in _pitwall5.py).

const SIZE = 330
const CENTRE = SIZE / 2
const RADIUS = SIZE / 2 - 18

const ringPoint = (fraction: number, radius = RADIUS): [number, number] => {
  const angle = 2 * Math.PI * (fraction + 0.75)
  return [CENTRE + radius * Math.sin(angle), CENTRE - radius * Math.cos(angle)]
}

/** A note just inside the ring at `fraction`, running away from the ring towards the middle so it clears the car. */
const notePoint = (fraction: number): { x: number; y: number; anchor: 'start' | 'end' | 'middle' } => {
  const [x] = ringPoint(fraction)
  const side = x - CENTRE
  const middle = Math.abs(side) < RADIUS * 0.3
  // Centred under or over the car it clears the ring's curve only further in.
  const [nx, ny] = ringPoint(fraction, RADIUS - (middle ? 26 : 16))
  return { x: nx, y: ny + 4, anchor: middle ? 'middle' : side > 0 ? 'end' : 'start' }
}

const arc = (from: number, to: number): string => {
  const [x0, y0] = ringPoint(from)
  const [x1, y1] = ringPoint(to)
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${RADIUS},${RADIUS} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`
}

/** The outline and every car's x/z, fitted into the ring's middle (+Z runs down the screen, as Analysis draws it). */
function inner(wall: PitWall): { path: string; place: (x: number, z: number) => [number, number] } | null {
  if (wall.outline.length < 3) return null
  const xs = wall.outline.map((point) => point.x)
  const zs = wall.outline.map((point) => point.z)
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const box = RADIUS * 1.3
  const scale = Math.min(box / (maxX - minX || 1), box / (maxZ - minZ || 1))
  const offsetX = CENTRE - ((maxX - minX) * scale) / 2
  const offsetY = CENTRE - ((maxZ - minZ) * scale) / 2
  const place = (x: number, z: number): [number, number] => [offsetX + (x - minX) * scale, offsetY + (z - minZ) * scale]
  const path = wall.outline.map((point, index) => `${index === 0 ? 'M' : 'L'}${place(point.x, point.z).map((value) => value.toFixed(1)).join(',')}`).join(' ') + ' Z'
  return { path, place }
}

/** The ring, the outline, the cars and a legend of our car and the classes. */
export function TrackTile({ data, frame, legend = true }: { data: TileData; frame: FrameProps; legend?: boolean }) {
  const wall = data.pitWall
  const player = wall ? playerOf(wall.field) : null
  return (
    <TileFrame frame={frame} title="Track" extra={player ? <span className="muted tabular">Lap {player.lapsCompleted + 1}</span> : undefined}>
      {wall && <Ring wall={wall} legend={legend} />}
    </TileFrame>
  )
}

/** Where our car would rejoin if it boxed now: in a race, once a stop's loss is measured and while ours is on track. */
function ghostOf(wall: PitWall): number | null {
  const player = playerOf(wall.field)
  const loss = pitLossTotal(wall.pitLoss)
  if (wall.session.sessionType !== 'Race' || !player || player.inPit || loss === null) return null
  return rejoin(wall.field, loss)?.fraction ?? null
}

function Ring({ wall, legend }: { wall: PitWall; legend: boolean }) {
  const starts = sectorStarts(wall.field)
  const yellows = wall.session.yellowSectors
  const ghost = ghostOf(wall)
  const bounds: number[] = starts ? [0, starts[0], starts[1], 1] : [0, 1]
  const map = inner(wall)
  const classes = classesOf(wall.field)
  // Our car last, so it sits on top; cars out of the race are off the road.
  const cars = wall.field.filter((car) => !isOut(car)).sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer))
  const [sfX, sfY] = ringPoint(0)
  const player = playerOf(wall.field)
  return (
    <div className="pw-ringrow">
      <svg className="pw-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Every car round the lap">
        {bounds.slice(0, -1).map((from, index) => {
          const to = bounds[index + 1]
          const [lx, ly] = ringPoint((from + to) / 2, RADIUS + 13)
          return (
            <g key={index}>
              {to - from >= 0.999 ? (
                <circle cx={CENTRE} cy={CENTRE} r={RADIUS} className="pw-ring-arc s0" />
              ) : (
                <path d={arc(from, to)} className={`pw-ring-arc s${index % 2}${yellows[index] ? ' yellow' : ''}`} />
              )}
              {starts && (
                <text x={lx} y={ly + 4} className="pw-ring-label">
                  S{index + 1}
                </text>
              )}
            </g>
          )
        })}
        <line x1={sfX - 8} y1={sfY} x2={sfX + 8} y2={sfY} className="pw-ring-line" />
        {map && <path d={map.path} className="pw-ring-track" />}
        {map &&
          cars.map((car) => {
            const [x, y] = map.place(car.x, car.z)
            return <circle key={`m${car.id}`} cx={x} cy={y} r={car.isPlayer ? 4 : 2.5} className={car.isPlayer ? 'pw-car you' : `pw-car c${classShade(wall.field, car.carClass)}`} />
          })}
        {cars
          .filter((car) => car.stopped)
          .map((car) => {
            const [x, y] = ringPoint(car.lapFraction)
            const note = notePoint(car.lapFraction)
            return (
              <g key={`h${car.id}`}>
                <circle cx={x} cy={y} r={11} className="pw-halo" />
                <text x={note.x} y={note.y} textAnchor={note.anchor} className="pw-ring-note">
                  #{carNumber(car)} stopped
                </text>
              </g>
            )
          })}
        {ghost !== null && player && (
          <g>
            <circle cx={ringPoint(ghost)[0]} cy={ringPoint(ghost)[1]} r={6.5} className="pw-car ghost">
              <title>#{carNumber(player)} if it boxed now</title>
            </circle>
            <text x={notePoint(ghost).x} y={notePoint(ghost).y} textAnchor={notePoint(ghost).anchor} className="pw-ring-note ghost">
              #{carNumber(player)} after a stop
            </text>
          </g>
        )}
        {cars.map((car) => {
          const [x, y] = ringPoint(car.lapFraction, car.inPit ? RADIUS - 12 : RADIUS)
          return (
            <circle
              key={car.id}
              cx={x}
              cy={y}
              r={car.isPlayer ? 6.5 : 4.5}
              className={`${car.isPlayer ? 'pw-car you' : `pw-car c${classShade(wall.field, car.carClass)}`}${car.inPit ? ' pitted' : ''}`}
            >
              <title>{car.driver}</title>
            </circle>
          )
        })}
      </svg>
      {legend && (
        <div className="pw-ring-legend">
          <span>
            <i className="pw-dot you" />
            {player ? `#${carNumber(player)}` : 'Our car'}
          </span>
          {classes.slice(0, 3).map((carClass, index) => (
            <span key={carClass}>
              <i className={`pw-dot c${index}`} />
              {carClass}
            </span>
          ))}
          {ghost !== null && (
            <span>
              <i className="pw-dot ghost" />
              {player ? `#${carNumber(player)}` : 'Our car'} if it boxed now
            </span>
          )}
          <span className="muted">Ring: the lap, every car by how far round it is. Inside: the track.</span>
        </div>
      )}
    </div>
  )
}
