import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SprintState } from '../bridge'
import { homeDevices, openPlans, overviewPrimary, planFacts, recentSessions } from './HomeDomain'

// ── Fixtures ─────────────────────────────────────────────────────────────

function state(overrides: Partial<SprintState>): SprintState {
  return {
    telemetry: { frame: null, link: { state: 'Disconnected', sourceName: '', detail: null, lastFrameValid: true, invalidReason: null }, hz: 0 },
    targets: null,
    settings: {},
    controls: {},
    catalog: {},
    devices: [],
    dashLayouts: [],
    setupTemplates: [],
    setupPrograms: [],
    engineerControls: [],
    radioLog: [],
    engineerPushState: {},
    plans: [],
    lapHistory: [],
    screens: [],
    ...overrides,
  }
}

const screenDevice = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'screen', width: 800, height: 480, ...extra })

const screen = (deviceId: string, connectionState: string) => ({
  deviceId,
  width: 800,
  height: 480,
  refreshHz: 30,
  layout: null,
  status: '',
  hardware: { status: { state: connectionState } },
})

// ── homeDevices ──────────────────────────────────────────────────────────

test('homeDevices lists enabled screen devices, connected first, with a status word for each', () => {
  const sprint = state({
    devices: [
      screenDevice('unplugged'),
      screenDevice('live'),
      screenDevice('never-seen'),
      screenDevice('off', { disabled: true }),
      { id: 'pedals', name: 'Pedals', type: 'input' },
    ],
    screens: [screen('unplugged', 'Disconnected'), screen('live', 'Connected'), screen('off', 'Connected')],
  })

  const devices = homeDevices(sprint)

  assert.deepEqual(
    devices.map((entry) => [entry.device.id, entry.connected, entry.statusLabel, entry.statusTone]),
    [
      ['live', true, 'Connected', 'live'],
      ['unplugged', false, 'Disconnected', 'idle'],
      ['never-seen', false, 'Not connected', 'idle'],
    ],
  )
})

// ── Plans ────────────────────────────────────────────────────────────────

test('overviewPrimary opens the armed plan and otherwise falls back to planning a session', () => {
  const sprint = state({
    plans: [
      { id: 'draft', status: 'Draft', createdAt: '2026-09-02' },
      { id: 'armed', status: 'Armed', createdAt: '2026-09-01' },
      { id: 'done', status: 'Completed', createdAt: '2026-09-03' },
    ],
  })

  const plans = openPlans(sprint)
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ['draft', 'armed'],
    'completed plans are not open',
  )

  const primary = overviewPrimary(plans)
  assert.equal(primary.kind, 'open-plan')
  assert.equal(primary.kind === 'open-plan' ? primary.plan.id : null, 'armed')

  const fallback = overviewPrimary(plans.filter((plan) => plan.status === 'Draft'))
  assert.equal(fallback.kind === 'plan-session' ? fallback.draft?.id : null, 'draft', 'with nothing armed, the draft is offered')
})

test('planFacts takes the earliest planned start, the race target lap and a readable race length', () => {
  const [plan] = openPlans(
    state({
      plans: [
        {
          id: 'spa',
          status: 'Armed',
          createdAt: '2026-09-01',
          raceLengthFormat: 'TimeBased',
          raceLengthValue: 90,
          avgLapTimeSeconds: 126,
          fuelPerLapLiters: 3.5,
          segments: [
            { id: 'r', kind: 'Race', plannedStart: '2026-10-02T17:30:00Z', laps: [] },
            { id: 'q', kind: 'Qualifying', plannedStart: '2026-10-02T17:00:00Z', laps: [] },
          ],
          targets: [{ kind: 'Race', lapTime: { scope: 'Practice', lapTimeSeconds: 125.8, sampleSize: 9, updatedAt: '2026-10-01' } }],
        },
      ],
    }),
  )

  assert.ok(plan)
  assert.deepEqual(planFacts(plan), { startsAt: '2026-10-02T17:00:00Z', raceLength: '1 h 30 min', targetLapSeconds: 125.8, fuelPerLapLiters: 3.5 })
})

// ── recentSessions ───────────────────────────────────────────────────────

const lap = (lapTimeSeconds: number, sectorsSeconds: number[], isValid = true) => ({ lapNumber: 1, isValid, lapTimeSeconds, sectorsSeconds })
const session = (id: string, startedAt: string, track: string, laps: unknown[]) => ({
  id,
  startedAt,
  kind: 'Qualifying',
  context: { game: 'LeMansUltimate', trackCourse: track, carModel: 'Porsche 963' },
  laps,
})

test('recentSessions opens up the newest session and compares it with your earlier best on the same car and track', () => {
  const sprint = state({
    lapHistory: [
      session('older-spa', '2026-09-20T18:00:00Z', 'Spa', [lap(125.2, [36.3, 53.9, 35.0]), lap(120, [30, 50, 40], false)]),
      session('monza', '2026-09-27T18:00:00Z', 'Monza', [lap(97.8, [30, 35, 32.8])]),
      session('newest-spa', '2026-09-28T19:00:00Z', 'Spa', [lap(125.0, [36.1, 53.8, 35.1]), lap(126.0, [36.0, 54, 36])]),
      { id: 'no-start', laps: [] },
    ],
  })

  const recent = recentSessions(sprint)

  assert.ok(recent)
  assert.equal(recent.last.id, 'newest-spa')
  assert.equal(recent.last.bestLapSeconds, 125.0)
  assert.deepEqual(recent.last.bestSectors, [36.1, 53.8, 35.1], "the best lap's own sectors")
  // Against 125.2 at Spa: the invalid 120 and the Monza lap do not count.
  assert.ok(Math.abs((recent.comparison.gapSeconds ?? 0) + 0.2) < 1e-9)
  assert.deepEqual(
    recent.comparison.sectorGaps.map((gap) => (gap === null ? null : Math.round(gap * 1000) / 1000)),
    [-0.2, -0.1, 0.1],
  )
  assert.deepEqual(
    recent.earlier.map((entry) => entry.id),
    ['monza', 'older-spa'],
  )
})

test('recentSessions has no gap for a first visit, and nothing at all without sessions', () => {
  const first = recentSessions(state({ lapHistory: [session('only', '2026-09-28T19:00:00Z', 'Spa', [lap(125, [])])] }))
  assert.equal(first?.comparison.gapSeconds, null)
  assert.deepEqual(first?.comparison.sectorGaps, [])

  assert.equal(recentSessions(state({})), null)
})
