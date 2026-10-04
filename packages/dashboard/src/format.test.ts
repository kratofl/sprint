import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDelta,
  formatFuel,
  formatFuelPerLap,
  formatFuelPerLapTarget,
  formatGap,
  formatGear,
  formatInt,
  formatLap,
  formatPressure,
  formatSpeedKph,
  formatTemp,
  roundToEven,
} from './format'

test('roundToEven breaks exact ties toward the even neighbor', () => {
  assert.equal(roundToEven(2.5), 2)
  assert.equal(roundToEven(3.5), 4)
  assert.equal(roundToEven(2.4), 2)
  assert.equal(roundToEven(2.6), 3)
  assert.equal(roundToEven(-2.5), -2)
})

test('formatLap shows a placeholder for non-positive or non-finite times', () => {
  assert.equal(formatLap(0), '--:--.---')
  assert.equal(formatLap(-1), '--:--.---')
  assert.equal(formatLap(NaN), '--:--.---')
  assert.equal(formatLap(Infinity), '--:--.---')
})

test('formatLap rounds milliseconds before splitting, so a near-minute value rolls over cleanly', () => {
  // 59.9996s rounds to 60000ms; truncating minutes/seconds first (instead of rounding the
  // whole value up front) would wrongly produce "0:60.000".
  assert.equal(formatLap(59.9996), '1:00.000')
  assert.equal(formatLap(92.345), '1:32.345')
  assert.equal(formatLap(5.007), '0:05.007')
})

test('formatDelta is zero for non-finite input and applies a dead band around zero', () => {
  assert.equal(formatDelta(NaN), '0.000')
  assert.equal(formatDelta(0.0001), '0.000')
  assert.equal(formatDelta(-0.0001), '0.000')
})

test('formatDelta signs positive deltas and rounds away from zero at 3dp', () => {
  assert.equal(formatDelta(0.5), '+0.500')
  assert.equal(formatDelta(-0.5), '-0.500')
  assert.equal(formatDelta(1.2346), '+1.235')
  assert.equal(formatDelta(-1.2346), '-1.235')
})

test('formatSpeedKph converts m/s to an integer km/h', () => {
  assert.equal(formatSpeedKph(50), '180')
  assert.equal(formatSpeedKph(0), '0')
})

test('formatTemp keeps at most one decimal and trims a trailing .0', () => {
  assert.equal(formatTemp(70), '70')
  assert.equal(formatTemp(70.5), '70.5')
  assert.equal(formatTemp(70.04), '70')
})

test('formatGear maps neutral and reverse to letters, everything else to its number', () => {
  assert.equal(formatGear(0), 'N')
  assert.equal(formatGear(-1), 'R')
  assert.equal(formatGear(4), '4')
})

test('formatInt truncates toward zero', () => {
  assert.equal(formatInt(4.9), '4')
  assert.equal(formatInt(-4.9), '-4')
})

test('formatGap shows a placeholder when there is no car', () => {
  assert.equal(formatGap(0), '--')
  assert.equal(formatGap(-1), '--')
  assert.equal(formatGap(NaN), '--')
  assert.equal(formatGap(1.2), '1.200')
})

test('formatPressure shows a placeholder when not reported', () => {
  assert.equal(formatPressure(0), '--')
  assert.equal(formatPressure(180.26), '180.3')
})

test('formatFuel and formatFuelPerLap use fixed decimal places', () => {
  assert.equal(formatFuel(42.5), '42.5')
  assert.equal(formatFuelPerLap(2.756), '2.76')
})

test('formatFuelPerLapTarget distinguishes "no plan" from "plan for 0"', () => {
  assert.equal(formatFuelPerLapTarget(null), '--')
  assert.equal(formatFuelPerLapTarget(0), '0.00')
  assert.equal(formatFuelPerLapTarget(2.4), '2.40')
})
