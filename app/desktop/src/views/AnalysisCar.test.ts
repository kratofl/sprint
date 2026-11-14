import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carHere, percentScale, withWheelSlip } from './AnalysisCar'
import type { TraceGrid } from './AnalysisDomain'

/** The car's readings at 11 points of a lap; `more` adds to or replaces the plain ones. */
function car(more: Record<string, number[]> = {}): TraceGrid {
  const along = (from: number, to: number) => Array.from({ length: 11 }, (_, index) => from + ((to - from) * index) / 10)
  const channels: Record<string, number[]> = { rpm: along(6000, 8000), fuel: along(50, 47) }
  for (const corner of ['FL', 'FR', 'RL', 'RR']) {
    const front = corner.startsWith('F')
    channels[`tyreTempInner${corner}`] = along(90, 100)
    channels[`tyreTempMiddle${corner}`] = along(85, 95)
    channels[`tyreTempOuter${corner}`] = along(80, 90)
    channels[`tyrePressure${corner}`] = along(165, 170)
    channels[`brakeTemp${corner}`] = along(300, 600)
    channels[`tyreWear${corner}`] = along(98, 97)
    channels[`rideHeight${corner}`] = along(front ? 0.05 : 0.064, front ? 0.04 : 0.054)
    channels[`surface${corner}`] = along(1, 1)
  }
  return { positionStep: 0.1, channels: { ...channels, ...more } }
}

test('the car at a place: each wheel as recorded there, the ride height per axle in millimetres', () => {
  const here = carHere(car(), 0.5)
  assert.deepEqual(here.corners[0], { corner: 'FL', inner: 95, middle: 90, outer: 85, pressureKPa: 167.5, brakeCelsius: 450, treadPercent: 97.5, state: null })
  assert.deepEqual(
    here.facts.map((fact) => [fact.label, fact.text, fact.chart]),
    [
      ['RPM', '7,000', 'rpm'],
      ['Fuel', '48.5 L', 'fuel'],
      ['Ride height', '45 · 59 mm', 'rideHeight'],
      // The game said nothing about damage on this lap.
      ['Damage', '—', null],
    ],
  )
})

test('a state is the nearest recorded one, never a blend: a kerb, a dent, a wheel that came off', () => {
  const steps = (value: number, from: number) => Array.from({ length: 11 }, (_, index) => (index >= from ? value : 0))
  const dents = Object.fromEntries(Array.from({ length: 8 }, (_, place) => [`dent${place}`, steps(place === 1 ? 2 : 0, 6)]))
  const hit = car({ ...dents, surfaceFL: steps(5, 6).map((value) => value + 1), detachedRR: steps(1, 8), detachedParts: steps(1, 8) })

  // Between the last dry sample and the first on the kerb, it is one or the other.
  assert.equal(carHere(hit, 0.54).corners[0].state, null)
  assert.equal(carHere(hit, 0.56).corners[0].state, 'kerb')
  const damage = (position: number) => carHere(hit, position).facts.find((fact) => fact.label === 'Damage')?.text
  assert.equal(damage(0.3), 'None')
  assert.equal(damage(0.7), 'Heavy')
  assert.equal(damage(0.9), 'Heavy · part off')
  assert.equal(carHere(hit, 0.9).corners[3].state, 'off the car')
})

test('the energy a car has is stated in per cent, whichever way the game reports the share', () => {
  const asShare = carHere(car({ virtualEnergy: Array.from({ length: 11 }, () => 0.68) }), 0.5)
  const asPercent = carHere(car({ virtualEnergy: Array.from({ length: 11 }, () => 68) }), 0.5)
  assert.deepEqual(asShare.facts[2], { label: 'Energy', text: '68 %', chart: 'energy' })
  assert.deepEqual(asPercent.facts[2], asShare.facts[2])
  assert.equal(percentScale(undefined), 1)
})

test('wheel slip is how fast the patch slides, along and across together', () => {
  const sliding = withWheelSlip(car({ slipLongFL: Array.from({ length: 11 }, () => -3), slipLatFL: Array.from({ length: 11 }, () => 4) }))
  assert.deepEqual([...new Set(sliding.channels.slipFL)], [5])
  assert.equal('slipFR' in sliding.channels, false)
})
