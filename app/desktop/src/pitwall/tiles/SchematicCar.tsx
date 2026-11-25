import type { ReactNode } from 'react'
import { DENT_ZONES, type DentZone } from '../carDomain'
import './SchematicCar.css'

// The car as LMU draws it itself, the same for every car, nose up, in 120 × 196: four wheels,
// the nose and the tail each an arc in three parts, and a line down either side between the
// wheels. Those eight parts are LMU's eight dent places. The pit wall's damage and tyre tiles and
// Analysis's car card draw it.

export const SCHEMATIC_WIDTH = 120
export const SCHEMATIC_HEIGHT = 196

export type Wheel = 'fl' | 'fr' | 'rl' | 'rr'
const WHEELS: readonly Wheel[] = ['fl', 'fr', 'rl', 'rr']

/** Each wheel's box. */
export const SCHEMATIC_WHEELS: Readonly<Record<Wheel, { x: number; y: number; width: number; height: number }>> = {
  fl: { x: 6, y: 44, width: 22, height: 40 },
  fr: { x: 92, y: 44, width: 22, height: 40 },
  rl: { x: 6, y: 130, width: 22, height: 40 },
  rr: { x: 92, y: 130, width: 22, height: 40 },
}

type Ellipse = { cx: number; cy: number; rx: number; ry: number }

const NOSE: Ellipse = { cx: 60, cy: 44, rx: 28, ry: 26 }
// The tail bends down: a negative `ry` turns the arc below its centre.
const TAIL: Ellipse = { cx: 60, cy: 170, rx: 28, ry: -16 }

/** A place on the ellipse at `degrees` (0 = right, 90 = its far end from the car's middle). */
function onEllipse({ cx, cy, rx, ry }: Ellipse, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180
  return [cx + rx * Math.cos(angle), cy - ry * Math.sin(angle)]
}

/** The ellipse from one angle to a smaller one, as a path: left to right across its far end. */
function arcPath(ellipse: Ellipse, from: number, to: number): string {
  const [x1, y1] = onEllipse(ellipse, from)
  const [x2, y2] = onEllipse(ellipse, to)
  return `M${x1.toFixed(1)},${y1.toFixed(1)} A${ellipse.rx},${Math.abs(ellipse.ry)} 0 0,${ellipse.ry > 0 ? 1 : 0} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

// Each arc in thirds, with a small gap between the parts: from, to, and the middle for a pin.
const LEFT_THIRD = [180, 123, 150] as const
const MIDDLE_THIRD = [117, 63, 90] as const
const RIGHT_THIRD = [57, 0, 30] as const
const arcPart = (ellipse: Ellipse, [from, to, middle]: readonly [number, number, number]) => ({ d: arcPath(ellipse, from, to), pin: onEllipse(ellipse, middle) })

/** Each dent place's part of the drawing, and where a pin on it sits. */
export const SCHEMATIC_PARTS: Readonly<Record<DentZone, { d: string; pin: [number, number] }>> = {
  frontLeft: arcPart(NOSE, LEFT_THIRD),
  front: arcPart(NOSE, MIDDLE_THIRD),
  frontRight: arcPart(NOSE, RIGHT_THIRD),
  right: { d: 'M88,92 L88,122', pin: [88, 107] },
  rearRight: arcPart(TAIL, RIGHT_THIRD),
  rear: arcPart(TAIL, MIDDLE_THIRD),
  rearLeft: arcPart(TAIL, LEFT_THIRD),
  left: { d: 'M32,92 L32,122', pin: [32, 107] },
}

/**
 * The car. `partClass` adds a class to each dent place's part and `wheelClass` to a wheel (the
 * damage tile colours both); `wheels: false` leaves the wheels to `extra`, which is drawn on top
 * of everything.
 */
export function SchematicCar({
  label,
  className,
  partClass,
  wheelClass = {},
  wheels = true,
  extra,
}: {
  label: string
  className?: string
  partClass?: (zone: DentZone) => string
  wheelClass?: Partial<Record<Wheel, string>>
  wheels?: boolean
  extra?: ReactNode
}) {
  return (
    <svg viewBox={`0 0 ${SCHEMATIC_WIDTH} ${SCHEMATIC_HEIGHT}`} className={className ? `schematic-car ${className}` : 'schematic-car'} role="img" aria-label={label}>
      {wheels &&
        WHEELS.map((wheel) => {
          const { x, y, width, height } = SCHEMATIC_WHEELS[wheel]
          return <rect key={wheel} x={x} y={y} width={width} height={height} rx={5} className={`schematic-car-wheel ${wheelClass[wheel] ?? ''}`} />
        })}
      {DENT_ZONES.map((zone) => (
        <path key={zone} d={SCHEMATIC_PARTS[zone].d} className={partClass ? `schematic-car-part ${partClass(zone)}` : 'schematic-car-part'} />
      ))}
      {extra}
    </svg>
  )
}
