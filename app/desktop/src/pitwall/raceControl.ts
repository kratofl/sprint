import type { FieldEntry, PitWall, PitWallSession, RaceEvent } from './pitWallData'
import { carNumber, clockLeft, playerOf } from './timing'

// Race control for the pit wall: the session's flag as the header strip shows it, the feed's lines
// and the cars standing on track. Pure; the tiles only render it.

/** The strip's colour: the flag being shown, or none before the start. */
export type FlagTone = 'green' | 'yellow' | 'fcy' | 'red' | 'over' | 'none'

export type FlagState = { label: string; tone: FlagTone; sectors: readonly [boolean, boolean, boolean] }

const sectorList = (sectors: readonly boolean[]): string =>
  sectors.flatMap((yellow, index) => (yellow ? [`S${index + 1}`] : [])).join(' ')

/**
 * The flag over the whole session: a full course yellow, a stop or the chequered flag outrank
 * local yellows; green with a yellow sector reads "Yellow · S2".
 */
export function flagState(session: Pick<PitWallSession, 'phase' | 'yellowSectors'>): FlagState {
  const sectors = session.yellowSectors
  const yellow = sectors.some(Boolean)
  const state = (label: string, tone: FlagTone): FlagState => ({ label, tone, sectors })
  switch (session.phase) {
    case 'FullCourseYellow':
      return state('Full course yellow', 'fcy')
    case 'Stopped':
      return state('Red flag', 'red')
    case 'Over':
      return state('Chequered', 'over')
    case 'Green':
      return yellow ? state(`Yellow · ${sectorList(sectors)}`, 'yellow') : state('Green', 'green')
    case 'Formation':
      return state('Formation', 'none')
    case 'Countdown':
      return state('Start lights', 'none')
    case 'BeforeStart':
      return state('Before the start', 'none')
    case 'Unknown':
      return yellow ? state(`Yellow · ${sectorList(sectors)}`, 'yellow') : state('—', 'none')
  }
}

/** "#28 J. Marchetti": a car as an event or the field names it. */
const named = (car: { car: string; id: number; driver: string }): string => `#${carNumber(car)} ${car.driver}`.trim()

export type FeedLine = { key: string; time: string; text: string; note: string; tone: FlagTone | 'blue' | 'penalty' | 'out' }

/** One feed entry in words, with its note on the right ("S2 · lap 31", "for #63"). */
export function feedLine(event: RaceEvent, index: number, player: FieldEntry | null): FeedLine {
  const car = event.carId === null ? '' : named({ car: event.car, id: event.carId, driver: event.driver })
  const lap = event.lap === null ? '' : `lap ${event.lap}`
  const line = (text: string, tone: FeedLine['tone'], note = ''): FeedLine => ({ key: `${index}`, time: clockLeft(event.time), text, note, tone })
  switch (event.kind) {
    case 'Green':
      return line('Green flag', 'green')
    case 'FullCourseYellow':
      return line('Full course yellow', 'fcy')
    case 'Stopped':
      return line('Red flag · session stopped', 'red')
    case 'Over':
      return line('Chequered flag', 'over')
    case 'SectorYellow':
      return line(`Yellow in sector ${event.sector ?? '?'}`, 'yellow')
    case 'SectorClear':
      return line(`Sector ${event.sector ?? '?'} clear`, 'green')
    case 'CarStopped':
      return line(`${car} stopped`, 'yellow', [event.sector !== null ? `S${event.sector}` : '', lap].filter(Boolean).join(' · '))
    case 'Penalty':
      return line(`${car} · penalty to serve`, 'penalty', lap)
    case 'PenaltyServed':
      return line(`${car} · penalty served`, 'none', lap)
    case 'BlueFlag':
      return line(`${car} shown blue`, 'blue', player && event.carId !== player.id ? `for #${carNumber(player)}` : '')
    case 'Retired':
      return line(`${car} retired`, 'out', lap)
    case 'Disqualified':
      return line(`${car} disqualified`, 'out', lap)
  }
}

/** The feed newest first, at most `limit` lines. */
export const feedLines = (wall: Pick<PitWall, 'raceControl' | 'field'>, limit = 50): FeedLine[] => {
  const player = playerOf(wall.field)
  return wall.raceControl
    .map((event, index) => feedLine(event, index, player))
    .reverse()
    .slice(0, limit)
}

export type StoppedCar = { entry: FieldEntry; sector: number | null; since: number | null }

/** The cars standing on track, each with where and since when (the feed's newest stop of that car). */
export function stoppedCars(wall: Pick<PitWall, 'raceControl' | 'field'>): StoppedCar[] {
  return wall.field
    .filter((entry) => entry.stopped)
    .map((entry) => {
      const event = [...wall.raceControl].reverse().find((candidate) => candidate.kind === 'CarStopped' && candidate.carId === entry.id)
      return { entry, sector: event?.sector ?? (entry.sector >= 1 && entry.sector <= 3 ? entry.sector : null), since: event?.time ?? null }
    })
}

/** "#28 stopped in S2 · since 1:12:01" for the header strip; several cars are counted instead. */
export function stoppedSummary(cars: readonly StoppedCar[]): string {
  if (cars.length === 0) return ''
  if (cars.length > 1) return `${cars.length} cars stopped on track`
  const [{ entry, sector, since }] = cars
  return `#${carNumber(entry)} stopped${sector !== null ? ` in S${sector}` : ''}${since !== null ? ` · since ${clockLeft(since)}` : ''}`
}

/** "DNF · lap 22", "DSQ · lap 15": what the timing shows where an out car's gap was. */
export const outCell = (entry: Pick<FieldEntry, 'finishStatus' | 'lapsCompleted'>): string =>
  `${entry.finishStatus === 'Disqualified' ? 'DSQ' : 'DNF'} · lap ${entry.lapsCompleted + 1}`
