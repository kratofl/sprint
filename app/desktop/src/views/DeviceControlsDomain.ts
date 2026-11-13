// Pure geometry and rules for a device's Controls tab (DeviceControls.tsx): the coloured label
// boxes drawn round a wheel's multi-dial, and the zoom onto a control on the device picture.

/** The ring's drawing space: centred on 0,0, `RING_EXTENT` to every side. */
export const RING_EXTENT = 160
const RING_RADIUS = 118
const RING_WIDTH = 40
/** Free space between two boxes, in degrees, on top of their round ends. */
const RING_GAP_DEGREES = 3

/** How far the stage zooms in on a control. */
export const CONTROL_ZOOM = 2.4

/** One label box: its arc, and where and how its name sits along it. */
export type RingSegment = {
  index: number
  /** The arc's centre line; drawn as a round-capped stroke `RING_WIDTH` wide. */
  path: string
  textX: number
  textY: number
  /** Degrees; the name runs along the ring and is never upside down. */
  textRotation: number
  /** The centre of the box, for the "selected" arrow. */
  angle: number
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180
const round = (value: number): number => Math.round(value * 10) / 10
const pointAt = (radius: number, degrees: number): [number, number] => [round(radius * Math.cos(radians(degrees))), round(radius * Math.sin(radians(degrees)))]

/**
 * The boxes for a dial with `count` positions, clockwise from the top-right one -- the order a
 * preset lists them in. Positions come in pairs round the dial, so no box sits dead centre.
 */
export function ringSegments(count: number): RingSegment[] {
  if (count <= 0) return []
  const step = 360 / count
  const capDegrees = (RING_WIDTH / 2 / RING_RADIUS) * (180 / Math.PI)
  const half = Math.max(1, step / 2 - capDegrees - RING_GAP_DEGREES)
  return Array.from({ length: count }, (_, index) => {
    const angle = -90 + (index + 0.5) * step
    const [x1, y1] = pointAt(RING_RADIUS, angle - half)
    const [x2, y2] = pointAt(RING_RADIUS, angle + half)
    const [textX, textY] = pointAt(RING_RADIUS, angle)
    return {
      index,
      path: `M${x1} ${y1} A${RING_RADIUS} ${RING_RADIUS} 0 0 1 ${x2} ${y2}`,
      textX,
      textY,
      textRotation: readableRotation(angle + 90),
      angle,
    }
  })
}

/** Folds a text angle into -90…90 so the text never reads upside down. */
export function readableRotation(degrees: number): number {
  let rotation = ((degrees % 360) + 360) % 360
  if (rotation > 180) rotation -= 360
  if (rotation > 90) rotation -= 180
  if (rotation < -90) rotation += 180
  return round(rotation)
}

/** The arrow inside the ring that points at the selected box, as an SVG path. */
export function selectionArrow(angle: number): string {
  const [tipX, tipY] = pointAt(84, angle)
  const [leftX, leftY] = pointAt(68, angle - 10)
  const [rightX, rightY] = pointAt(68, angle + 10)
  return `M${tipX} ${tipY} L${leftX} ${leftY} L${rightX} ${rightY} Z`
}

export const RING_STROKE = RING_WIDTH

/**
 * The CSS transform that zooms the device picture onto a point (`x`, `y` as fractions of the
 * picture) so it lands in the middle of the stage.
 */
export function zoomTransform(x: number, y: number, scale: number): string {
  const percent = (value: number): string => `${round(50 - value * scale * 100)}%`
  return `translate(${percent(x)}, ${percent(y)}) scale(${scale})`
}

/**
 * The ring's width as a fraction of the stage, so its outer edge covers the zoomed dial's
 * printed ring (`radius` is a fraction of the picture's width).
 */
export function ringWidthFraction(radius: number, scale: number): number {
  return (2 * radius * scale * RING_EXTENT) / (RING_RADIUS + RING_WIDTH / 2)
}

export const isHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value)
