import type { GameFolder } from '../bridge'

/**
 * The first-run setup's steps (FirstRun.tsx). It can't be skipped: Sprint opens on it until the
 * host records it done (`firstRun.complete`). Game and Your laps only exist where Sprint can read
 * the game (`firstRun.game`, the results import); elsewhere the setup is You, then Done.
 */
export type FirstRunStep = 'you' | 'game' | 'laps' | 'done'

export const STEP_LABELS: Record<FirstRunStep, string> = { you: 'You', game: 'Game', laps: 'Your laps', done: 'Done' }

export const firstRunSteps = (game: GameFolder | null, importAvailable: boolean): FirstRunStep[] => [
  'you',
  ...(game ? (['game'] as const) : []),
  ...(game && importAvailable ? (['laps'] as const) : []),
  'done',
]

/** The host's default name (`AppSettings.DriverName`): what a driver who never set one would share. */
const DEFAULT_DRIVER_NAME = 'your name'

/** Why the driver name can't be used yet, or null. The host checks the same (`firstRun.complete`). */
export const driverNameProblem = (name: string): string | null => {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter the name other drivers will see.'
  if (trimmed.toLowerCase() === DEFAULT_DRIVER_NAME) return 'Use your own name, or the one you race under.'
  return null
}

/** Why the race number can't be used yet, or null: one to three digits, as on a car. */
export const raceNumberProblem = (number: string): string | null => (/^\d{1,3}$/.test(number.trim()) ? null : 'One to three digits.')

/** Leaving the Game step needs a real install; telemetry doesn't, the game may well not be running. */
export const canLeaveGame = (game: GameFolder | null): boolean => game === null || game.found

/** The Game step's lead, by what the host found. */
export const gameLead = (game: GameFolder): string => {
  if (!game.found) return game.folder.length > 0 ? 'That folder isn’t Le Mans Ultimate. Choose the folder the game is installed in.' : 'Sprint couldn’t find it. Choose the folder it’s installed in.'
  return game.chosen ? 'Sprint reads your setups and results from here.' : 'Sprint found it. Check it’s the copy you play.'
}

export const plural = (count: number, one: string, many: string): string => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`

/**
 * The racing timeline over the card: one sector per step, the start line at the first and the flag
 * at the last. Positions are fractions of the line's length, so the view draws it at any width.
 */
export const timelineStops = (steps: number): number[] => Array.from({ length: steps }, (_, index) => (steps < 2 ? 0 : index / (steps - 1)))
