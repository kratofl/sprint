import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusSession } from './AnalysisDomain'
import { NO_BROWSE_FILTERS, browseCars, browseSessions, circuitChoices, circuitsOf, classSections, gapOnLayout, recentCars } from './AnalysisBrowseDomain'

const NOW = Date.parse('2026-11-15T22:00:00Z')

type Car = { model: string; group: string; tag: string }
const PORSCHE: Car = { model: 'Porsche 963', group: 'Hypercar Porsche', tag: 'HYP' }
const ORECA_ELMS: Car = { model: 'Oreca 07', group: 'LMP2 ELMS', tag: 'LMP2 ELMS' }
const BMW: Car = { model: 'BMW M4 LMGT3', group: 'LMGT3 BMW', tag: 'LMGT3' }

let next = 0
function session(car: Car, course: string, circuit: string, layout: string, startedAt: string, best: number, kind: CorpusSession['kind'] = 'Practice'): CorpusSession {
  next += 1
  return {
    id: `s${next}`,
    context: { game: 'LeMansUltimate', trackCourse: course, carModel: car.group, carType: car.model, livery: null, trackLengthMeters: null, carClass: null },
    kind,
    origin: 'Recorded',
    startedAt,
    lapCount: 8,
    tracedLapCount: 8,
    bestLapSeconds: best,
    sharedFrom: null,
    day: null,
    label: kind,
    detail: '',
    hasChannels: true,
    runs: 2,
    circuitId: circuit.toLowerCase(),
    circuitName: circuit,
    layout,
    country: null,
    classTag: car.tag,
    make: car.model.split(' ')[0],
  }
}

const SESSIONS = [
  session(PORSCHE, 'Circuit de Spa-Francorchamps', 'Spa', 'Grand Prix', '2026-11-15T20:00:00Z', 124.5, 'Qualifying'),
  session(PORSCHE, 'Circuit de Spa-Francorchamps Endurance', 'Spa', 'Endurance', '2026-11-13T20:00:00Z', 127.2),
  session(BMW, 'Autodromo Nazionale Monza', 'Monza', 'Grand Prix', '2026-11-12T20:00:00Z', 107.9),
  session(PORSCHE, 'Circuit de Spa-Francorchamps', 'Spa', 'Grand Prix', '2026-10-01T20:00:00Z', 125.1),
  session(ORECA_ELMS, 'Circuit de la Sarthe', 'Le Mans', 'Circuit de la Sarthe', '2026-09-01T20:00:00Z', 214.3),
]

test('cars sit in racing’s class order, the most driven first in each', () => {
  const sections = classSections(browseCars(SESSIONS), (car) => car.sessions.length)
  assert.deepEqual(
    sections.map((section) => [section.name, section.cars.map((car) => `${car.model} ${car.sessions.length}`)]),
    [
      ['Hypercar', ['Porsche 963 3']],
      ['LMP2 · ELMS', ['Oreca 07 1']],
      ['LMGT3', ['BMW M4 LMGT3 1']],
    ],
  )
})

test('Recent is the newest cars, and stays away while it would list every car', () => {
  assert.deepEqual(recentCars(browseCars(SESSIONS)), [])
  const many = Array.from({ length: 7 }, (_, index) =>
    session({ model: `Car ${index}`, group: `Group ${index}`, tag: 'GT3' }, 'Monza', 'Monza', 'Grand Prix', `2026-11-0${index + 1}T20:00:00Z`, 100),
  )
  assert.deepEqual(
    recentCars(browseCars(many)).map((car) => car.model),
    ['Car 6', 'Car 5', 'Car 4', 'Car 3', 'Car 2'],
  )
})

test('a car’s circuits hold their layouts apart, each with its own best', () => {
  const porsche = browseCars(SESSIONS)[0]
  const [spa] = circuitsOf(porsche.sessions)
  assert.equal(spa.sessionCount, 3)
  assert.deepEqual(
    spa.layouts.map((layout) => [layout.label, layout.sessions.length, layout.bestSeconds]),
    [
      ['Grand Prix', 2, 124.5],
      ['Endurance', 1, 127.2],
    ],
  )
  assert.equal(gapOnLayout(spa.layouts[0].sessions[1], spa.layouts[0]), 0.6)
})

test('the Date filter counts back from now, and the Track filter offers only what the others leave', () => {
  const lastMonth = browseSessions(SESSIONS, { ...NO_BROWSE_FILTERS, date: 'month' }, NOW)
  assert.deepEqual(new Set(lastMonth.map((entry) => entry.context.carModel)), new Set(['Hypercar Porsche', 'LMGT3 BMW']))
  assert.deepEqual(
    circuitChoices(SESSIONS, { ...NO_BROWSE_FILTERS, date: 'month', circuits: ['Le Mans'] }, NOW),
    [
      { value: 'Le Mans', count: 0 },
      { value: 'Monza', count: 1 },
      { value: 'Spa', count: 2 },
    ],
  )
  assert.deepEqual(browseSessions(SESSIONS, { ...NO_BROWSE_FILTERS, search: 'endurance' }, NOW).map((entry) => entry.layout), ['Endurance'])
})
