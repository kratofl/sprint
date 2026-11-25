import LMU_TURNS from '../assets/tracks/lmu-turns.json'

/** A track's turn by its real number, at its apex as a share of the lap (0..1). */
export type TrackTurn = { number: number; at: number }

// Keyed by LMU's own track name in lower case. Source: assets/tracks/README.md.
const lmuTurns: Readonly<Record<string, readonly TrackTurn[] | undefined>> = LMU_TURNS

// Every spelling of Le Mans Ultimate stored history carries (GameNames.cs on the host).
const LMU_NAMES = ['lemansultimate', 'le mans ultimate', 'lmu']

/** The real turns of a track, by the game's own track name; null for a track or game Sprint has none for. */
export function trackTurns(game: string, track: string): readonly TrackTurn[] | null {
  if (!LMU_NAMES.includes(game.toLowerCase())) return null
  return lmuTurns[track.trim().toLowerCase()] ?? null
}
