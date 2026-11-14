import type { FieldEntry, PitLoss } from './pitWallData'
import { isOut, playerOf, referenceLap } from './timing'

// What a pit stop would do to our race: the measured loss, where the car rejoins, and who is round
// it at the exit. The model is plain: every other car keeps its last lap's pace and nobody else
// stops. Pure; the pit stop and track tiles only render it.

/** Lane plus standing, seconds; null until both have been measured. */
export const pitLossTotal = (loss: PitLoss): number | null => (loss.lane !== null && loss.standing !== null ? loss.lane + loss.standing : null)

/** A car near the rejoin: `seconds` positive ahead of where we come out, negative behind. */
export type Near = { entry: FieldEntry; seconds: number }

export type Rejoin = {
  /** How many laps from now we box: 0 this lap. */
  inLaps: number
  /** Place in our class after the stop. */
  classPlace: number
  /** The class cars just ahead of and behind us in the race after the stop. */
  ahead: Near | null
  behind: Near | null
  /** The nearest car on the road at the exit within `TRAFFIC_SECONDS`, any class. */
  traffic: Near | null
  /** Where on the lap we come out, as the ring places it (0..1). */
  fraction: number
}

/** A car within this many seconds of us on the road at the exit is traffic. */
export const TRAFFIC_SECONDS = 2

const wrap = (value: number): number => value - Math.floor(value)

/**
 * Where our car rejoins if it boxes `inLaps` laps from now and loses `loss` seconds: race
 * progress (laps) moves back by the loss over our lap time; every other car still racing moves on
 * by its own pace over the same time. Null without our car or a lap time to measure in.
 */
export function rejoin(field: readonly FieldEntry[], loss: number, inLaps = 0): Rejoin | null {
  const player = playerOf(field)
  const lap = referenceLap(field)
  if (!player || lap === null) return null
  const ours = player.lapsCompleted + player.lapFraction + inLaps - loss / lap
  const others = field
    .filter((entry) => !entry.isPlayer && !isOut(entry))
    .map((entry) => {
      const pace = entry.lastLap ?? entry.bestLap ?? lap
      return { entry, progress: entry.lapsCompleted + entry.lapFraction + (inLaps * lap) / pace }
    })
  const rivals = others.filter((other) => other.entry.carClass === player.carClass)
  const ahead = rivals.filter((other) => other.progress > ours).sort((a, b) => a.progress - b.progress)[0]
  const behind = rivals.filter((other) => other.progress <= ours).sort((a, b) => b.progress - a.progress)[0]
  const near = (other: { entry: FieldEntry; progress: number } | undefined): Near | null => (other ? { entry: other.entry, seconds: (other.progress - ours) * lap } : null)
  const road = others
    .filter((other) => !other.entry.inPit)
    .map((other) => {
      const apart = wrap(other.progress - ours + 0.5) - 0.5
      return { entry: other.entry, seconds: apart * lap }
    })
    .filter((other) => Math.abs(other.seconds) <= TRAFFIC_SECONDS)
    .sort((a, b) => Math.abs(a.seconds) - Math.abs(b.seconds))
  return {
    inLaps,
    classPlace: 1 + rivals.filter((other) => other.progress > ours).length,
    ahead: near(ahead),
    behind: near(behind),
    traffic: road[0] ?? null,
    fraction: wrap(ours),
  }
}

/** "alongside at the exit", "1.6 s ahead at the exit", "clear". */
export function trafficText(traffic: Near | null, name: (entry: FieldEntry) => string): string {
  if (!traffic) return 'clear'
  const who = name(traffic.entry)
  if (Math.abs(traffic.seconds) < 1) return `${who} alongside at the exit`
  return `${who} ${Math.abs(traffic.seconds).toFixed(1)} s ${traffic.seconds > 0 ? 'ahead' : 'behind'} at the exit`
}
