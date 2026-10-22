import type { GuideGeometry, GuidePose, GuideView } from './guideModel'

/**
 * The monitor overlay's maths: from a world point to a pixel, exactly as
 * docs/internals/driving-guide.md defines it. The VR layer does the same in C++
 * (`app/Sprint.OpenXrLayer/src/guide_math.h`); keep the two in step. Pure, so
 * every step is a unit test.
 */

export type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

/** Telemetry older than this is not extrapolated further; a guess that far out is worse than a stale line. */
export const MAX_EXTRAPOLATION_SECONDS = 0.1

/** The ribbon starts this far ahead, which keeps most of it off the bonnet. */
const START_METERS = 4
const RIBBON_HALF_WIDTH = 0.15
/** Boards stand on a post: their bottom edge is this far above the line. */
const BOARD_LIFT = 0.3
const BOARD_EDGE = 0.08
const NEAR = 0.1

const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

/** Rotates `v` by the unit quaternion `q`. */
export const rotate = (q: Quat, v: Vec3): Vec3 => {
  const u = { x: q.x, y: q.y, z: q.z }
  const t = cross(u, v)
  const t2 = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z }
  const c = cross(u, t2)
  return { x: v.x + q.w * t2.x + c.x, y: v.y + q.w * t2.y + c.y, z: v.z + q.w * t2.z + c.z }
}

const multiply = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
})

/**
 * Where the car is `dt` seconds after the reading: position moves along the body velocity
 * turned into the world, orientation turns by the body angular velocity.
 */
export const extrapolate = (pose: GuidePose, dt: number): GuidePose => {
  const seconds = Math.min(Math.max(dt, 0), MAX_EXTRAPOLATION_SECONDS)
  if (seconds === 0) return pose
  const q = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw }
  const velocity = rotate(q, { x: pose.vx, y: pose.vy, z: pose.vz })
  const rate = Math.hypot(pose.wx, pose.wy, pose.wz)
  let turned = q
  if (rate > 1e-9) {
    const half = (rate * seconds) / 2
    const s = Math.sin(half) / rate
    turned = multiply(q, { x: pose.wx * s, y: pose.wy * s, z: pose.wz * s, w: Math.cos(half) })
  }
  return {
    ...pose,
    x: pose.x + velocity.x * seconds,
    y: pose.y + velocity.y * seconds,
    z: pose.z + velocity.z * seconds,
    qx: turned.x, qy: turned.y, qz: turned.z, qw: turned.w,
  }
}

/** A world point in the seat frame: the driver's eye at the origin, looking down -Z. */
export const toSeat = (world: Vec3, pose: GuidePose, view: GuideView): Vec3 => {
  const body = rotate({ x: -pose.qx, y: -pose.qy, z: -pose.qz, w: pose.qw }, { x: world.x - pose.x, y: world.y - pose.y, z: world.z - pose.z })
  const d = { x: body.x - view.eyeRight, y: body.y - view.eyeUp, z: body.z + view.eyeForward }
  // Ry(-yaw): a positive yaw turns the guide right.
  const yaw = (-view.yaw * Math.PI) / 180
  const r = { x: Math.cos(yaw) * d.x + Math.sin(yaw) * d.z, y: d.y, z: -Math.sin(yaw) * d.x + Math.cos(yaw) * d.z }
  // Rx(pitch): a positive pitch raises it.
  const pitch = (view.pitch * Math.PI) / 180
  return { x: r.x, y: Math.cos(pitch) * r.y - Math.sin(pitch) * r.z, z: Math.sin(pitch) * r.y + Math.cos(pitch) * r.z }
}

export type Screen = { width: number; height: number; fov: number }

/** A seat-frame point on screen, or null behind the near plane. `fov` is vertical, in degrees. */
export const project = (seat: Vec3, screen: Screen): { x: number; y: number } | null => {
  if (seat.z > -NEAR) return null
  const f = 1 / Math.tan((screen.fov * Math.PI) / 360)
  const aspect = screen.width / screen.height
  const ndcX = (seat.x * f) / aspect / -seat.z
  const ndcY = (seat.y * f) / -seat.z
  return { x: ((ndcX + 1) / 2) * screen.width, y: ((1 - ndcY) / 2) * screen.height }
}

/** Line point indices from just ahead of the car to `metersAhead`, wrapping past the line. */
export const indicesAhead = (geometry: GuideGeometry, trackPosition: number, metersAhead: number): number[] => {
  const loop = geometry.points.length / 4 - 1
  const metersPerPoint = geometry.positionStep * geometry.trackLength
  const car = trackPosition / geometry.positionStep
  const first = Math.ceil(car + START_METERS / metersPerPoint)
  const last = Math.floor(car + metersAhead / metersPerPoint)
  const indices: number[] = []
  for (let i = first; i <= last; i++) indices.push(((i % loop) + loop) % loop)
  return indices
}

export type Pedal = 'coast' | 'throttle' | 'brake'
export type RibbonRun = { pedal: Pedal; points: string }
export type BoardShape = { outer: string; inner: string }
export type OverlayShapes = { runs: RibbonRun[]; boards: BoardShape[] }

const pedals: readonly Pedal[] = ['coast', 'throttle', 'brake']

const point = (geometry: GuideGeometry, index: number): Vec3 => ({
  x: geometry.points[index * 4],
  y: geometry.points[index * 4 + 1],
  z: geometry.points[index * 4 + 2],
})

/**
 * Everything the overlay draws for one pose, as SVG polygon point lists. The ribbon is cut
 * into runs of one pedal state; a run also ends where a point falls behind the camera.
 */
export const overlayShapes = (geometry: GuideGeometry, pose: GuidePose, view: GuideView, screen: Screen): OverlayShapes => {
  const ahead = indicesAhead(geometry, pose.trackPosition, view.metersAhead)
  const runs: RibbonRun[] = []
  if (view.showLine) {
    let left: string[] = []
    let right: string[] = []
    let pedal: Pedal | null = null
    const flush = () => {
      if (pedal && left.length > 1) runs.push({ pedal, points: [...left, ...right.reverse()].join(' ') })
      left = []
      right = []
    }
    for (let k = 0; k < ahead.length; k++) {
      const index = ahead[k]
      const here = point(geometry, index)
      const next = point(geometry, ahead[Math.min(k + 1, ahead.length - 1)])
      const previous = point(geometry, ahead[Math.max(k - 1, 0)])
      const tx = next.x - previous.x
      const tz = next.z - previous.z
      const length = Math.hypot(tx, tz) || 1
      // Right of travel on the ground: t × up.
      const rx = (-tz / length) * RIBBON_HALF_WIDTH
      const rz = (tx / length) * RIBBON_HALF_WIDTH
      const l = project(toSeat({ x: here.x - rx, y: here.y, z: here.z - rz }, pose, view), screen)
      const r = project(toSeat({ x: here.x + rx, y: here.y, z: here.z + rz }, pose, view), screen)
      const kind = pedals[geometry.points[index * 4 + 3]] ?? 'coast'
      if (!l || !r) {
        flush()
        pedal = null
        continue
      }
      const pair = [`${l.x.toFixed(1)},${l.y.toFixed(1)}`, `${r.x.toFixed(1)},${r.y.toFixed(1)}`]
      if (kind !== pedal) {
        // Runs share their boundary pair, so the ribbon has no gaps where the colour changes.
        const carried = left.length > 0 ? [left[left.length - 1], right[right.length - 1]] : null
        flush()
        if (carried) {
          left.push(carried[0])
          right.push(carried[1])
        }
        pedal = kind
      }
      left.push(pair[0])
      right.push(pair[1])
    }
    flush()
  }

  const boards: BoardShape[] = []
  if (view.showBoards) {
    const visible = new Set(ahead)
    for (const board of geometry.boards) {
      if (!visible.has(board.index)) continue
      const outer = boardQuad(board, geometry.boardWidth / 2, BOARD_LIFT, BOARD_LIFT + geometry.boardHeight, pose, view, screen)
      const inner = boardQuad(board, geometry.boardWidth / 2 - BOARD_EDGE, BOARD_LIFT + BOARD_EDGE, BOARD_LIFT + geometry.boardHeight - BOARD_EDGE, pose, view, screen)
      if (outer && inner) boards.push({ outer, inner })
    }
  }

  return { runs, boards }
}

/** A board face as a polygon: across the facing direction, between two heights above its base. */
const boardQuad = (
  board: GuideGeometry['boards'][number],
  halfWidth: number,
  bottom: number,
  top: number,
  pose: GuidePose,
  view: GuideView,
  screen: Screen,
): string | null => {
  // Across the board: perpendicular to where it faces, on the ground.
  const ax = -board.facingZ * halfWidth
  const az = board.facingX * halfWidth
  const corners = [
    { x: board.x - ax, y: board.y + bottom, z: board.z - az },
    { x: board.x + ax, y: board.y + bottom, z: board.z + az },
    { x: board.x + ax, y: board.y + top, z: board.z + az },
    { x: board.x - ax, y: board.y + top, z: board.z - az },
  ]
  const projected = corners.map((corner) => project(toSeat(corner, pose, view), screen))
  if (projected.some((corner) => corner === null)) return null
  return projected.map((corner) => (corner ? `${corner.x.toFixed(1)},${corner.y.toFixed(1)}` : '')).join(' ')
}
