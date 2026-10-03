import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LatestFrameSender, readScreenOutputs, type PixelFrame } from './frames.js'

const frame = (sequence: number): PixelFrame => ({ width: 1, height: 1, sequence, bytes: new Uint8Array(4) })
const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

test('a stalled consumer receives the newest pending frame, never a growing backlog', async () => {
  const received: number[] = []
  let release: (() => void) | undefined
  const sender = new LatestFrameSender(async (value) => {
    received.push(value.sequence)
    if (value.sequence === 1) await new Promise<void>((resolve) => { release = resolve })
  }, (error) => { throw error })
  sender.offer(frame(1))
  for (let sequence = 2; sequence <= 100; sequence++) sender.offer(frame(sequence))
  assert.deepEqual(received, [1])
  release?.()
  await nextTurn()
  assert.deepEqual(received, [1, 100])
  sender.stop()
})

test('stopping drops pending frames and cancels the in-flight transfer', async () => {
  const received: number[] = []
  let requestSignal: AbortSignal | undefined
  const sender = new LatestFrameSender(async (value, signal) => {
    received.push(value.sequence)
    requestSignal = signal
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
  }, (error) => { throw error })
  sender.offer(frame(1))
  sender.offer(frame(2))
  sender.stop()
  sender.offer(frame(3))
  await nextTurn()
  assert.equal(requestSignal?.aborted, true)
  assert.deepEqual(received, [1])
})

test('screen boundary rejects corrupt dimensions and non-dashboard outputs', () => {
  const valid = { deviceId: 'wheel', width: 800, height: 480, refreshHz: 30, layout: { id: 'race' } }
  assert.equal(readScreenOutputs({ screens: [valid] }).length, 1)
  assert.deepEqual(readScreenOutputs({ screens: [
    { ...valid, width: Number.NaN }, { ...valid, height: 0 },
    { ...valid, width: 100000 }, { ...valid, layout: 'race' },
  ] }), [])
})
