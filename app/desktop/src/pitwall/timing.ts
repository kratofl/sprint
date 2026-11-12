import type { FieldEntry, PitWall } from './pitWallData'

// The field, worked out for the timing, relative and track tiles: places gained, sector colours,
// gaps, the cars round ours and where the sectors are. Pure; the tiles only render it.

/** "2:04.9" (one decimal by default), "—" for no time. */
export function lapClock(seconds: number | null, decimals = 1): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—'
  // Rounded first, so 59.96 reads 1:00.0 rather than 0:60.0.
  const scale = 10 ** decimals
  const rounded = Math.round(seconds * scale) / scale
  const minutes = Math.floor(rounded / 60)
  const shown = (rounded - minutes * 60).toFixed(decimals)
  return minutes > 0 ? `${minutes}:${shown.padStart(decimals + (decimals > 0 ? 3 : 2), '0')}` : shown
}

/** "5:12:40" or "12:40", "—" for no time. */
export function clockLeft(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

/** "+4.2", "−0.21": a signed difference with a real minus sign. */
export function signed(value: number, decimals = 1): string {
  const shown = Math.abs(value).toFixed(decimals)
  if (Number(shown) === 0) return (0).toFixed(decimals)
  return `${value < 0 ? '−' : '+'}${shown}`
}

/** A gap cell: "Leader", "+3 L" a lap or more down, else "+9.8". */
export function gapCell(seconds: number, laps: number, leader: boolean): string {
  if (leader) return 'Leader'
  if (laps > 0) return `+${laps} L`
  // LMU reports a negative interval for a car placed behind one sitting in the pits: no real gap.
  if (seconds < 0) return '—'
  return `+${seconds.toFixed(1)}`
}

/** The car's number from the game's entry name ("… #63"), else its slot id. */
export function carNumber(entry: Pick<FieldEntry, 'car' | 'id'>): string {
  const match = /#\s*(\d+)/.exec(entry.car)
  return match ? match[1] : String(entry.id)
}

/** The car's model without its number, as the bar shows it ("Porsche 963"). */
export const carName = (entry: Pick<FieldEntry, 'car'>): string => entry.car.replace(/\s*#\s*\d+.*$/, '').trim() || entry.car

/** Places gained since the start (positive) or lost; null outside a race or before it is known. */
export const placesGained = (entry: Pick<FieldEntry, 'startPlace' | 'place'>): number | null =>
  entry.startPlace === null || entry.place <= 0 ? null : entry.startPlace - entry.place

/** The first letter a tyre chip shows: S, M, H, W; null for no compound. */
export function compoundLetter(compound: string | null): string | null {
  if (!compound) return null
  return compound.trim().charAt(0).toUpperCase() || null
}

export type SectorMark = 'purple' | 'green' | null

/** Classes in the order of their best-placed car. */
export function classesOf(field: readonly FieldEntry[]): string[] {
  const ordered = [...field].filter((car) => car.carClass.length > 0).sort((a, b) => (a.place || 999) - (b.place || 999))
  return [...new Set(ordered.map((car) => car.carClass))]
}

/** 0 for the first class on the board, 1 the second, 2 any after: the class bar's and dot's shade. */
export const classShade = (field: readonly FieldEntry[], carClass: string): number => Math.min(2, Math.max(0, classesOf(field).indexOf(carClass)))

const EPSILON = 0.0005

/**
 * Each car's last-lap sectors against the best: purple when it is the best of that sector in its
 * class so far, green when it is the car's own best, else plain.
 */
export function sectorMarks(field: readonly FieldEntry[]): Map<number, readonly [SectorMark, SectorMark, SectorMark]> {
  const classBest = new Map<string, number[]>()
  for (const car of field) {
    const best = classBest.get(car.carClass) ?? [Infinity, Infinity, Infinity]
    for (let sector = 0; sector < 3; sector++) {
      for (const time of [car.bestSectors[sector], car.lastSectors[sector]]) {
        if (time !== null && time > 0 && time < best[sector]) best[sector] = time
      }
    }
    classBest.set(car.carClass, best)
  }
  const marks = new Map<number, readonly [SectorMark, SectorMark, SectorMark]>()
  for (const car of field) {
    const best = classBest.get(car.carClass) ?? [Infinity, Infinity, Infinity]
    const mark = (sector: 0 | 1 | 2): SectorMark => {
      const time = car.lastSectors[sector]
      if (time === null || time <= 0) return null
      if (time <= best[sector] + EPSILON) return 'purple'
      const own = car.bestSectors[sector]
      return own === null || time <= own + EPSILON ? 'green' : null
    }
    marks.set(car.id, [mark(0), mark(1), mark(2)])
  }
  return marks
}

/** The field in race order, optionally one class only. */
export const timingRows = (field: readonly FieldEntry[], carClass: string | null): FieldEntry[] =>
  [...field].filter((car) => carClass === null || car.carClass === carClass).sort((a, b) => (a.place || 999) - (b.place || 999))

export const playerOf = (field: readonly FieldEntry[]): FieldEntry | null => field.find((car) => car.isPlayer) ?? null

/** The lap time the field's spread is measured in: our last lap, else our best, else the field's best. */
export function referenceLap(field: readonly FieldEntry[]): number | null {
  const player = playerOf(field)
  const candidates = [player?.lastLap, player?.bestLap, ...field.map((car) => car.bestLap)]
  for (const time of candidates) if (time !== null && time !== undefined && time > 0) return time
  return null
}

/** Laps left: whole laps of a lap race, else the clock over the reference lap; null when neither is known. */
export function lapsLeft(pitWall: Pick<PitWall, 'session' | 'field'>): number | null {
  const player = playerOf(pitWall.field)
  const { maxLaps, timeRemaining } = pitWall.session
  if (maxLaps > 0 && maxLaps < 10_000 && player) return Math.max(0, maxLaps - player.lapsCompleted)
  const lap = referenceLap(pitWall.field)
  if (timeRemaining !== null && lap !== null) return Math.max(0, timeRemaining / lap)
  return null
}

export type TimingSummary = { lap: string; position: string; timeLeft: string; lastLap: string; bestLap: string; overallBest: string }

/** The strip over the table: our lap of the race, position, time left, last, best and the overall best. */
export function timingSummary(pitWall: Pick<PitWall, 'session' | 'field'>): TimingSummary {
  const player = playerOf(pitWall.field)
  const left = lapsLeft(pitWall)
  const lap = player ? player.lapsCompleted + 1 : null
  const fastest = pitWall.field.filter((car) => car.bestLap !== null && car.bestLap > 0).sort((a, b) => (a.bestLap ?? 0) - (b.bestLap ?? 0))[0]
  const lapCount = lap === null ? '—' : left === null ? String(lap) : pitWall.session.maxLaps > 0 && pitWall.session.maxLaps < 10_000 ? `${lap} / ${pitWall.session.maxLaps}` : `${lap} / ≈${Math.round((player?.lapsCompleted ?? 0) + left)}`
  return {
    lap: lapCount,
    position: player && player.place > 0 ? `P${player.place} · class P${player.classPlace || player.place}` : '—',
    timeLeft: clockLeft(pitWall.session.timeRemaining),
    lastLap: lapClock(player?.lastLap ?? null),
    bestLap: lapClock(player?.bestLap ?? null),
    overallBest: fastest ? `${lapClock(fastest.bestLap)} · #${carNumber(fastest)}` : '—',
  }
}

export type RelativeRow = {
  entry: FieldEntry
  /** Seconds on the road: negative ahead of us, positive behind; 0 for ours. */
  seconds: number
  note: 'lap ahead' | 'lap down' | null
}

/**
 * The cars round ours on the road, nearest `each` ahead and behind, by lap fraction against the
 * reference lap. Cars in the pit lane are left out. Ahead first, ours in the middle.
 */
export function relativeRows(field: readonly FieldEntry[], each = 3): RelativeRow[] {
  const player = playerOf(field)
  const lap = referenceLap(field)
  if (!player || lap === null) return []
  const progress = (car: FieldEntry) => car.lapsCompleted + car.lapFraction
  const others = field
    .filter((car) => !car.isPlayer && !car.inPit)
    .map((car): RelativeRow => {
      let ahead = car.lapFraction - player.lapFraction
      if (ahead > 0.5) ahead -= 1
      if (ahead <= -0.5) ahead += 1
      const lead = progress(car) - progress(player)
      return { entry: car, seconds: -ahead * lap, note: lead > 0.5 ? 'lap ahead' : lead < -0.5 ? 'lap down' : null }
    })
  const ahead = others.filter((row) => row.seconds < 0).sort((a, b) => b.seconds - a.seconds).slice(0, each).reverse()
  const behind = others.filter((row) => row.seconds >= 0).sort((a, b) => a.seconds - b.seconds).slice(0, each)
  return [...ahead, { entry: player, seconds: 0, note: null }, ...behind]
}

/**
 * Where sectors 2 and 3 start, as lap fractions, from where the cars are: halfway between the
 * furthest car still in a sector and the nearest car already in the next. Null until every
 * sector has a car in it.
 */
export function sectorStarts(field: readonly FieldEntry[]): readonly [number, number] | null {
  const inSector = (sector: number) => field.filter((car) => car.sector === sector && !car.inPit).map((car) => car.lapFraction)
  const [one, two, three] = [inSector(1), inSector(2), inSector(3)]
  if (one.length === 0 || two.length === 0 || three.length === 0) return null
  const second = (Math.max(...one) + Math.min(...two)) / 2
  const third = (Math.max(...two) + Math.min(...three)) / 2
  return second > 0 && third > second && third < 1 ? [second, third] : null
}
