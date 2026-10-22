import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GuideGeometry, GuidePose, GuideView } from './guideModel'
import { extrapolate, indicesAhead, overlayShapes, project, toSeat } from './guideProjection'

const still: GuidePose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, trackPosition: 0 }
const eyeAtOrigin: GuideView = { showLine: true, showBoards: true, eyeRight: 0, eyeUp: 0, eyeForward: 0, yaw: 0, pitch: 0, fov: 60, metersAhead: 100 }
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`)

test('a point straight ahead of a car at the origin is straight ahead of the eye', () => {
  const seat = toSeat({ x: 0, y: 0, z: -10 }, still, eyeAtOrigin)
  close(seat.x, 0)
  close(seat.y, 0)
  close(seat.z, -10)
})

test('the eye offset is subtracted in the car frame, wherever the car points', () => {
  // Facing +X: a quarter turn right (negative about +Y) takes the forward -Z to +X.
  const facingPlusX: GuidePose = { ...still, qy: -Math.SQRT1_2, qw: Math.SQRT1_2 }
  const seat = toSeat({ x: 10, y: 0, z: 0 }, facingPlusX, { ...eyeAtOrigin, eyeUp: 1, eyeForward: 2 })
  close(seat.x, 0)
  close(seat.y, -1)
  close(seat.z, -8)
})

test('a positive yaw moves the guide right and a positive pitch raises it', () => {
  assert.ok(toSeat({ x: 0, y: 0, z: -10 }, still, { ...eyeAtOrigin, yaw: 5 }).x > 0)
  assert.ok(toSeat({ x: 0, y: 0, z: -10 }, still, { ...eyeAtOrigin, pitch: 5 }).y > 0)
})

test('extrapolation moves along the body velocity and turns by the yaw rate', () => {
  // 50 m/s forward, yawing left at 1 rad/s (+Y is left in a right-handed, Y-up frame).
  const moving: GuidePose = { ...still, vz: -50, wy: 1 }
  const later = extrapolate(moving, 0.1)
  close(later.z, -5)
  const heading = 2 * Math.atan2(later.qy, later.qw)
  close(heading, 0.1)
})

test('extrapolation is clamped, so a stalled feed cannot fling the line away', () => {
  const moving: GuidePose = { ...still, vz: -50 }
  close(extrapolate(moving, 5).z, -5)
  assert.equal(extrapolate(moving, -1), moving)
})

test('nothing behind the camera is projected, and the horizon sits mid-screen', () => {
  const screen = { width: 1920, height: 1080, fov: 60 }
  assert.equal(project({ x: 0, y: 0, z: 1 }, screen), null)
  const ahead = project({ x: 0, y: 0, z: -50 }, screen)
  assert.deepEqual(ahead, { x: 960, y: 540 })
})

/** A straight 1000 m lap along -Z on a 2 m grid; braking from 100 to 120, a board at 100. */
const straight = (): GuideGeometry => {
  const count = 501
  const points = new Float64Array(count * 4)
  for (let i = 0; i < count; i++) {
    points[i * 4 + 2] = -2 * i
    points[i * 4 + 3] = i >= 100 && i <= 120 ? 2 : 1
  }
  return { positionStep: 1 / 500, trackLength: 1000, points, boards: [{ x: -6, y: 0, z: -200, facingX: 0, facingZ: 1, index: 100 }], boardWidth: 1, boardHeight: 1.4 }
}

test('the window ahead wraps past the end of the lap', () => {
  const indices = indicesAhead(straight(), 0.99, 30)
  assert.equal(indices[0], 497)
  assert.equal(indices[indices.length - 1], 10)
  assert.ok(!indices.includes(500), 'the closing point repeats the first and is never drawn twice')
})

test('the ribbon splits where the pedal changes and the board shows once in range', () => {
  const geometry = straight()
  const view = { ...eyeAtOrigin, eyeUp: 1, metersAhead: 250 }
  const shapes = overlayShapes(geometry, { ...still, z: -100, trackPosition: 0.1 }, view, { width: 1920, height: 1080, fov: 60 })
  assert.deepEqual(shapes.runs.map((run) => run.pedal), ['throttle', 'brake', 'throttle'])
  assert.equal(shapes.boards.length, 1)

  const past = overlayShapes(geometry, { ...still, z: -300, trackPosition: 0.3 }, view, { width: 1920, height: 1080, fov: 60 })
  assert.deepEqual(past.runs.map((run) => run.pedal), ['throttle'])
  assert.equal(past.boards.length, 0)
})
