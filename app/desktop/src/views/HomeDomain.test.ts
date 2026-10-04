import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SprintState } from '../bridge'
import { homeDevices, lapHistorySummary, openPlans, overviewPrimary } from './HomeDomain'

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

  assert.deepEqual(overviewPrimary(plans.filter((plan) => plan.status === 'Draft')), { kind: 'plan-session' })
})

// ── lapHistorySummary ────────────────────────────────────────────────────

test('lapHistorySummary counts recorded sessions and their laps, skipping rows without an id', () => {
  const sprint = state({
    lapHistory: [{ id: 'a', laps: [{}, {}, {}] }, { id: 'b', laps: [] }, { id: 'c' }, { laps: [{}] }],
  })

  assert.deepEqual(lapHistorySummary(sprint), { sessions: 3, laps: 3 })
})
