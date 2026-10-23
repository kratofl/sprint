// Gridline values for the hand-built SVG charts (components/app/charts.tsx).

// What a chart's values are: plain numbers step 1, 2 or 5 × 10ⁿ; durations in
// seconds step the way a clock reads (1, 2, 5, 10, 15, 30 s, 1, 2, 5, 10, 15, 30 min,
// then hours).
export type TickScale = 'decimal' | 'duration'

/**
 * Round gridline values spanning 0 and every value, negatives included: the
 * smallest step on `scale` (never below `minStep`) that needs at most `intervals`
 * intervals. Always at least two ticks; the first and last are the y domain.
 */
export function niceTicks(values: readonly number[], intervals: number, minStep = 1, scale: TickScale = 'decimal'): number[] {
  const finite = values.filter(Number.isFinite)
  const low = Math.min(0, ...finite)
  const high = Math.max(0, low + minStep, ...finite)
  const most = Math.max(2, intervals)
  for (const step of steps(scale, minStep)) {
    const below = Math.ceil(-low / step)
    const above = Math.ceil(high / step)
    if (below + above <= most) return Array.from({ length: below + above + 1 }, (_, index) => (index - below) * step)
  }
  throw new Error('unreachable: steps() never ends')
}

const clockSteps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]

// Candidate steps, smallest first, endless.
function* steps(scale: TickScale, minStep: number): Generator<number> {
  if (scale === 'duration') yield* clockSteps.filter((step) => step >= minStep)
  for (let power = scale === 'duration' ? Math.max(minStep, 3600) : minStep; ; power *= 10) {
    yield power
    yield 2 * power
    yield 5 * power
  }
}
