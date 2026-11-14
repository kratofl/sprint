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
    sessionCount: 0,
    recentSessions: null,
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

// The comparison itself is computed on the host (RecentSessionsTests.cs); this side narrows and labels.
const hostSession = (id: string, kind: string) => ({
  id, kind, track: 'Spa', car: 'Porsche 963', startedAt: '2026-09-28T19:00:00+00:00', lapCount: 2, bestLapSeconds: 125, bestSectors: [36.1, 53.8, 35.1],
})

test('recentSessions narrows the host summary and labels each kind', () => {
  const recent = recentSessions(state({
    recentSessions: {
      last: hostSession('newest', 'TestDay'),
      comparison: { gapSeconds: -0.2, sectorGaps: [-0.2, null, 0.1] },
      earlier: [hostSession('older', 'Qualifying'), { id: 'no-start' }],
    },
  }))

  assert.ok(recent)
  assert.equal(recent.last.kind, 'Test day')
  assert.deepEqual(recent.last.bestSectors, [36.1, 53.8, 35.1])
  assert.deepEqual(recent.comparison, { gapSeconds: -0.2, sectorGaps: [-0.2, null, 0.1] })
  assert.deepEqual(recent.earlier.map((entry) => [entry.id, entry.kind]), [['older', 'Qualifying']], 'a malformed row is dropped')
})

test('recentSessions is nothing without sessions', () => {
  assert.equal(recentSessions(state({ recentSessions: null })), null)
})
