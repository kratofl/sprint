import test from 'node:test'
import assert from 'node:assert/strict'
import { endsStream, initialLiveState, liveReducer, parseLiveEvent, TRACE_GAP_MS, upstreamFailure, type LiveAction, type LiveEvent, type LiveState } from './live.ts'
import { tracePoints } from './telemetry.ts'

// A LiveSample as the API serialises it; `at` is its unix ms timestamp.
const sample = (at: number, overrides: Record<string, unknown> = {}) => ({
  timestamp: at,
  lap: 3,
  sector: 2,
  currentLapTime: 41.2,
  lastLapTime: 92.481,
  bestLapTime: 91.903,
  delta: 0.31,
  lapValid: true,
  position: 4,
  speedKph: 241.5,
  rpm: 8120,
  maxRpm: 9000,
  gear: 5,
  throttle: 1,
  brake: 0,
  steering: -0.05,
  fuel: 38.2,
  trackPosition: 0.42,
  tyreTempFl: 88,
  tyreTempFr: 90,
  tyreTempRl: 84,
  tyreTempRr: 85,
  tyreWearFl: 12,
  tyreWearFr: 14,
  tyreWearRl: 9,
  tyreWearRr: 10,
  ...overrides,
})

const session = {
  sessionId: 's1',
  sessionKey: 'k1',
  driver: { id: 'd1', displayName: 'Alex Morgan', avatarUrl: null },
  game: 'LMU',
  track: 'Spa',
  car: 'Porsche 963',
  sessionType: 'Race',
  startedAt: '2026-10-12T18:00:00Z',
  connected: true,
}

const lap = (number: number) => ({ lap: number, lapTime: 92.481, valid: true, completedAt: 1_000 + number })

// Parses an event the way the view receives it: name + JSON text. Fails the test on null.
function event(name: string, data: unknown): LiveEvent {
  const parsed = parseLiveEvent(name, JSON.stringify(data))
  assert.ok(parsed, `${name} did not parse`)
  return parsed
}

const reduce = (state: LiveState, ...events: LiveAction[]) => events.reduce(liveReducer, state)

test('every server event parses into its typed shape', () => {
  assert.deepEqual(event('snapshot', { session, latest: sample(1_000), recent: [sample(950), sample(1_000)], laps: [lap(1)] }), {
    type: 'snapshot',
    session,
    latest: sample(1_000),
    recent: [sample(950), sample(1_000)],
    laps: [lap(1)],
  })
  assert.deepEqual(event('snapshot', { session, latest: null, laps: [] }).type, 'snapshot')
  assert.deepEqual(event('samples', { samples: [sample(1_000), sample(1_050)] }), { type: 'samples', samples: [sample(1_000), sample(1_050)] })
  assert.deepEqual(event('lap', { lap: lap(2) }), { type: 'lap', lap: lap(2) })
  assert.deepEqual(event('ended', { sessionKey: 'k1', reason: 'The session ended.' }), { type: 'ended', reason: 'The session ended.' })
  assert.deepEqual(event('revoked', { sessionKey: 'k1', reason: 'The driver removed you.' }), { type: 'revoked', reason: 'The driver removed you.' })
  assert.deepEqual(event('unavailable', { status: 'forbidden', reason: 'No access.' }), { type: 'unavailable', status: 'forbidden', reason: 'No access.' })
})

test('malformed or unknown events are dropped, not half-applied', () => {
  assert.equal(parseLiveEvent('samples', '{not json'), null)
  assert.equal(parseLiveEvent('samples', JSON.stringify({ samples: [sample(1_000, { speedKph: 'fast' })] })), null)
  assert.equal(parseLiveEvent('samples', JSON.stringify({ samples: [sample(1_000, { gear: undefined })] })), null)
  assert.equal(parseLiveEvent('snapshot', JSON.stringify({ session: { ...session, driver: null }, latest: null, laps: [] })), null)
  assert.equal(parseLiveEvent('snapshot', JSON.stringify({ session, latest: null, recent: [sample(1_000, { rpm: null })], laps: [] })), null)
  assert.equal(parseLiveEvent('unavailable', JSON.stringify({ status: 'teapot', reason: 'x' })), null)
  assert.equal(parseLiveEvent('telemetry', JSON.stringify({})), null)
})

test('a snapshot goes live with the latest readout; samples and laps follow', () => {
  const live = reduce(
    initialLiveState,
    event('snapshot', { session, latest: sample(1_000), laps: [lap(1)] }),
    event('samples', { samples: [sample(1_050), sample(1_100, { speedKph: 250 })] }),
    event('lap', { lap: lap(2) }),
  )
  assert.deepEqual(live.status, { kind: 'live' })
  assert.equal(live.receiving, true)
  assert.equal(live.latest?.speedKph, 250)
  assert.deepEqual(live.trace.map((point) => point.timestamp), [1_000, 1_050, 1_100])
  assert.deepEqual(live.laps.map((entry) => entry.lap), [1, 2])
})

test('a late viewer\'s trace starts with the snapshot\'s recent samples, gaps and all', () => {
  const recent = [sample(10_000), sample(10_050), sample(25_000), sample(25_050)]
  const late = reduce(initialLiveState, event('snapshot', { session, latest: sample(25_050), recent, laps: [] }), event('samples', { samples: [sample(25_100)] }))
  assert.deepEqual(late.trace.map((point) => point.timestamp), [10_000, 10_050, 25_000, 25_050, 25_100])
  const gaps = tracePoints(late.trace, 25_100, TRACE_GAP_MS).filter((point) => point.speed === null)
  assert.equal(gaps.length, 1)
})

test('a snapshot from an API that sends no recent samples starts the trace at the latest', () => {
  const live = reduce(initialLiveState, event('snapshot', { session, latest: sample(1_000), laps: [] }))
  assert.deepEqual(live.trace.map((point) => point.timestamp), [1_000])
})

test('the trace keeps a rolling 30 s window and ignores samples it already has', () => {
  const start = reduce(initialLiveState, event('snapshot', { session, latest: sample(0), laps: [] }))
  const later = reduce(start, event('samples', { samples: [sample(20_000), sample(31_000)] }), event('samples', { samples: [sample(20_000), sample(31_000)] }))
  assert.deepEqual(later.trace.map((point) => point.timestamp), [20_000, 31_000])
})

test('a reconnect keeps what was shown and resumes on the next snapshot without duplicating laps', () => {
  const live = reduce(initialLiveState, event('snapshot', { session, latest: sample(1_000), laps: [lap(1)] }))
  const dropped = liveReducer(live, { type: 'connection-lost' })
  assert.deepEqual(dropped.status, { kind: 'reconnecting' })
  assert.equal(dropped.latest?.timestamp, 1_000)
  const resumed = reduce(dropped, event('snapshot', { session, latest: sample(5_000), laps: [lap(1), lap(2)] }), event('lap', { lap: lap(2) }))
  assert.deepEqual(resumed.status, { kind: 'live' })
  assert.deepEqual(resumed.trace.map((point) => point.timestamp), [1_000, 5_000])
  assert.deepEqual(resumed.laps.map((entry) => entry.lap), [1, 2])
})

test('a driver whose desktop dropped shows as not receiving until samples arrive again', () => {
  const waiting = reduce(initialLiveState, event('snapshot', { session: { ...session, connected: false }, latest: sample(1_000), laps: [] }))
  assert.equal(waiting.receiving, false)
  const back = reduce(waiting, event('samples', { samples: [sample(2_000)] }))
  assert.equal(back.receiving, true)
  assert.equal(liveReducer(back, { type: 'stale' }).receiving, false)
})

test('ended keeps the final readout; revoked clears everything the viewer may no longer see', () => {
  const live = reduce(initialLiveState, event('snapshot', { session, latest: sample(1_000), laps: [lap(1)] }))
  const ended = reduce(live, event('ended', { sessionKey: 'k1', reason: 'The session ended.' }))
  assert.deepEqual(ended.status, { kind: 'ended', reason: 'The session ended.' })
  assert.equal(ended.latest?.timestamp, 1_000)
  assert.equal(ended.receiving, false)

  const revoked = reduce(live, event('revoked', { sessionKey: 'k1', reason: 'The driver removed you.' }))
  assert.deepEqual(revoked.status, { kind: 'revoked', reason: 'The driver removed you.' })
  assert.equal(revoked.latest, null)
  assert.deepEqual(revoked.trace, [])
  assert.deepEqual(revoked.laps, [])
})

test('after the stream is over, late events and connection noise change nothing', () => {
  const ended = reduce(initialLiveState, event('snapshot', { session, latest: sample(1_000), laps: [] }), event('ended', { sessionKey: 'k1', reason: 'Done.' }))
  assert.deepEqual(reduce(ended, event('samples', { samples: [sample(2_000)] }), { type: 'connection-lost' }), ended)
  const revoked = reduce(initialLiveState, event('revoked', { sessionKey: 'k1', reason: 'Removed.' }))
  assert.deepEqual(reduce(revoked, event('snapshot', { session, latest: sample(1_000), laps: [] })), revoked)
})

test('a refused connection says why; only a server error keeps retrying', () => {
  const refused = (status: string) => reduce(initialLiveState, event('unavailable', { status, reason: 'why' })).status
  assert.deepEqual(refused('not-live'), { kind: 'ended', reason: 'why' })
  assert.deepEqual(refused('forbidden'), { kind: 'revoked', reason: 'why' })
  assert.deepEqual(refused('signed-out'), { kind: 'signed-out' })
  assert.deepEqual(refused('error'), { kind: 'reconnecting' })
  assert.deepEqual(liveReducer(initialLiveState, { type: 'connection-closed' }).status, {
    kind: 'failed',
    reason: 'The live connection closed. Reload the page to try again.',
  })
})

test('the API status of a refused stream maps to what the viewer is told', () => {
  assert.equal(upstreamFailure(404).status, 'not-live')
  assert.equal(upstreamFailure(403).status, 'forbidden')
  assert.equal(upstreamFailure(401).status, 'signed-out')
  assert.equal(upstreamFailure(502).status, 'error')
  assert.equal(upstreamFailure(null).status, 'error')
})

test('the view closes its stream on ended, revoked and a refusal other than a server error', () => {
  assert.equal(endsStream(event('ended', { sessionKey: 'k1', reason: 'x' })), true)
  assert.equal(endsStream(event('revoked', { sessionKey: 'k1', reason: 'x' })), true)
  assert.equal(endsStream(event('unavailable', { status: 'not-live', reason: 'x' })), true)
  assert.equal(endsStream(event('unavailable', { status: 'error', reason: 'x' })), false)
  assert.equal(endsStream(event('samples', { samples: [] })), false)
})
