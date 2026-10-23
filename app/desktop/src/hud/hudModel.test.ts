import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDelta, parseHudMessage } from './hudModel'

test('the delta says ahead with a real minus and behind with a plus', () => {
  assert.deepEqual(formatDelta(-0.2141), { text: '−0.214', tone: 'ahead' })
  assert.deepEqual(formatDelta(0.3), { text: '+0.300', tone: 'behind' })
  assert.deepEqual(formatDelta(0.0002), { text: '0.000', tone: 'even' })
  assert.deepEqual(formatDelta(null), { text: '—', tone: 'even' })
})

test('a chart message keeps its samples and drops a domain that runs backwards', () => {
  const message = parseHudMessage({
    kind: 'chart',
    locked: true,
    panel: { title: 'Brake', unit: '%', series: [{ name: 'Target', role: 'Comparison', samples: [{ x: 1, y: 2 }, { x: 'bad', y: 3 }] }] },
    domain: { min: 10, max: 5 },
    carMeters: 7,
  })

  assert.equal(message?.kind, 'chart')
  if (message?.kind !== 'chart') return
  assert.equal(message.domain, null)
  assert.deepEqual(message.chart?.series[0].samples, [{ x: 1, y: 2 }])
  assert.equal(message.chart?.series[0].role, 'Comparison')
})
