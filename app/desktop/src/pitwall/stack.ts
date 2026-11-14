import type { CarDamage, PitWallTile, RadarCar, TileKind } from './pitWallData'

// How a stack (one slot, several tiles) takes turns, apart from React and timers. The view ticks
// `stepStack` once a second and on every change; `shownLayer` says which layer to draw.

/** A car this close sideways and lengthwise is alongside ours (metres). */
export const ALONGSIDE_SIDEWAYS_METERS = 8
export const ALONGSIDE_LENGTHWISE_METERS = 6
/** How long a stack stays on damage after a new hit. */
export const DAMAGE_JUMP_MS = 20_000

/**
 * Where a stack is in its cycle: the layer it is on (`base`), how long it has shown it, and the
 * hit it last saw (`impactSeen`, undefined until the first look at damage data, so a hit that was
 * already there when the board arrived never jumps).
 */
export type StackRun = { base: number; elapsedMs: number; impactSeen: number | null | undefined; damageUntil: number | null }

export const startStack = (): StackRun => ({ base: 0, elapsedMs: 0, impactSeen: undefined, damageUntil: null })

/** What a stack reacts to right now. */
export type StackSignals = { now: number; hovered: boolean; radar: readonly RadarCar[]; damage: CarDamage | null }

export const carAlongside = (radar: readonly RadarCar[]): boolean =>
  radar.some((car) => Math.abs(car.right) <= ALONGSIDE_SIDEWAYS_METERS && Math.abs(car.ahead) <= ALONGSIDE_LENGTHWISE_METERS)

type StackConfig = Pick<PitWallTile, 'layers' | 'cycleSeconds' | 'pauseOnHover' | 'jumpRadar' | 'jumpDamage'>

/** The layer a jump puts on screen right now, or null when the stack shows its own cycle. */
const jumpLayer = (tile: StackConfig, run: StackRun, signals: StackSignals): number | null => {
  const radar = tile.layers.indexOf('radar')
  if (tile.jumpRadar && radar >= 0 && carAlongside(signals.radar)) return radar
  const damage = tile.layers.indexOf('damage')
  if (tile.jumpDamage && damage >= 0 && run.damageUntil !== null && signals.now < run.damageUntil) return damage
  return null
}

export type StackView = {
  index: number
  kind: TileKind
  /** Why it shows a layer other than its cycle's. */
  jumped: 'radar' | 'damage' | null
  paused: boolean
  /** Whole seconds until the next layer; null when switched by hand, paused or jumped. */
  secondsToNext: number | null
}

export function shownLayer(tile: StackConfig, run: StackRun, signals: StackSignals): StackView {
  const base = Math.min(run.base, tile.layers.length - 1)
  const jump = jumpLayer(tile, run, signals)
  const paused = tile.pauseOnHover && signals.hovered
  const index = jump ?? base
  const counting = tile.cycleSeconds !== null && tile.layers.length > 1 && jump === null && !paused
  return {
    index,
    kind: tile.layers[index],
    jumped: jump === null ? null : tile.layers[jump] === 'radar' ? 'radar' : 'damage',
    paused: paused && tile.cycleSeconds !== null && tile.layers.length > 1,
    secondsToNext: counting && tile.cycleSeconds !== null ? Math.max(1, Math.ceil(tile.cycleSeconds - run.elapsedMs / 1000)) : null,
  }
}

/**
 * Advances a stack by `dtMs`: notices a new hit (it starts the damage jump), and moves the cycle
 * on unless it is switched by hand, paused by the mouse or showing a jump.
 */
export function stepStack(tile: StackConfig, run: StackRun, signals: StackSignals, dtMs: number): StackRun {
  const impact = signals.damage?.lastImpact?.sessionTime ?? null
  let next: StackRun = run
  if (run.impactSeen === undefined) {
    if (signals.damage !== null) next = { ...next, impactSeen: impact }
  }
  else if (impact !== null && impact !== run.impactSeen) next = { ...next, impactSeen: impact, damageUntil: signals.now + DAMAGE_JUMP_MS }
  if (next.damageUntil !== null && signals.now >= next.damageUntil) next = { ...next, damageUntil: null }

  const view = shownLayer(tile, next, signals)
  if (tile.cycleSeconds === null || tile.layers.length < 2 || view.jumped !== null || view.paused) return next
  const elapsedMs = next.elapsedMs + dtMs
  if (elapsedMs < tile.cycleSeconds * 1000) return { ...next, elapsedMs }
  return { ...next, base: (Math.min(next.base, tile.layers.length - 1) + 1) % tile.layers.length, elapsedMs: 0 }
}

/** Picked by hand (dots or arrows): that layer, its time starting over. */
export const pickLayer = (run: StackRun, index: number): StackRun => ({ ...run, base: index, elapsedMs: 0, damageUntil: null })

/** The layer before or after the one shown, wrapping round. */
export const stepIndex = (index: number, count: number, delta: -1 | 1): number => (index + delta + count) % count
