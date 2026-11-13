import { useId, type ReactNode } from 'react'
import './CarSvg.css'

// A top-down LMH prototype built from parts, nose up, 200 × 424. Each right-hand part is the
// left one mirrored. Geometry ported from the mockup (`PARTS`, `car_svg` in
// .dev/mockups/_pitwall3.py); the tyre and damage tiles draw on it.

/** The same path on the other side of the car's centre line (x → 200 − x). */
const mirror = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${200 - Number(x)},${y}`)

const SPLITTER = 'M18,28 Q100,6 182,28 L184,36 L16,36Z'
const NOSE = 'M62,36 C70,18 130,18 138,36 L142,156 L58,156Z'
const FENDER_F = 'M136,32 C152,28 178,30 190,46 C196,62 196,120 192,140 C188,152 176,158 160,158 L140,158 C136,120 136,70 136,32Z'
const MID = 'M46,150 L154,150 C160,200 162,250 160,282 L40,282 C38,250 40,200 46,150Z'
const FENDER_R = 'M140,276 C160,270 184,280 190,300 C196,330 196,370 190,386 C186,394 176,398 164,398 L136,398 C132,360 134,310 140,276Z'
const COVER = 'M70,250 L130,250 L136,398 L64,398Z'
const CANOPY = 'M100,128 C122,128 130,156 130,184 C130,218 120,248 100,258 C80,248 70,218 70,184 C70,156 78,128 100,128Z'
const SCREEN = 'M76,168 C80,140 120,140 124,168 C114,160 86,160 76,168Z'
const INLET = 'M144,154 L156,154 L158,180 L146,180Z'
const FENDERS = [FENDER_F, mirror(FENDER_F), FENDER_R, mirror(FENDER_R)]
const PARTS = [SPLITTER, NOSE, FENDER_F, mirror(FENDER_F), MID, FENDER_R, mirror(FENDER_R), COVER]

export type Wheel = 'fl' | 'fr' | 'rl' | 'rr'
const WHEELS: readonly { x: number; y: number; wheel: Wheel }[] = [
  { x: 180, y: 62, wheel: 'fr' },
  { x: 4, y: 62, wheel: 'fl' },
  { x: 180, y: 300, wheel: 'rr' },
  { x: 4, y: 300, wheel: 'rl' },
]

export const CAR_WIDTH = 200
export const CAR_HEIGHT = 424

/** The car; `zones` are drawn clipped to its body, `extra` on top of everything. */
export function CarSvg({ className, zones, wheelClass = {}, extra, label }: { className?: string; zones?: ReactNode; wheelClass?: Partial<Record<Wheel, string>>; extra?: ReactNode; label: string }) {
  const clip = useId()
  return (
    <svg viewBox={`0 0 ${CAR_WIDTH} ${CAR_HEIGHT}`} className={className ? `pw-carsvg ${className}` : 'pw-carsvg'} role="img" aria-label={label}>
      <defs>
        <clipPath id={clip}>
          {PARTS.map((d) => (
            <path key={d} d={d} />
          ))}
        </clipPath>
      </defs>
      {WHEELS.map(({ x, y, wheel }) => (
        <rect key={wheel} x={x} y={y} width={16} height={y < 200 ? 66 : 72} rx={5} className={`pw-car-wheel ${wheelClass[wheel] ?? ''}`} />
      ))}
      {PARTS.map((d) => (
        <path key={d} d={d} className={FENDERS.includes(d) ? 'pw-car-part hi' : 'pw-car-part'} />
      ))}
      {zones && <g clipPath={`url(#${clip})`}>{zones}</g>}
      <path d={INLET} className="pw-car-shade" />
      <path d={mirror(INLET)} className="pw-car-shade" />
      {[64, 76, 88, 100].map((y) => (
        <path key={y} d={`M158,${y} l18,5 M42,${y} l-18,5`} className="pw-car-line" />
      ))}
      <path d="M170,40 l14,10 M30,40 l-14,10" className="pw-car-light" />
      <path d={CANOPY} className="pw-car-canopy" />
      <path d={SCREEN} className="pw-car-shade" />
      <rect x={98} y={258} width={4} height={134} rx={2} className="pw-car-fin" />
      <path d="M86,392 L86,404 M114,392 L114,404" className="pw-car-line" />
      <rect x={8} y={398} width={184} height={16} rx={3} className="pw-car-wing" />
      <rect x={4} y={384} width={7} height={36} rx={2} className="pw-car-wing" />
      <rect x={189} y={384} width={7} height={36} rx={2} className="pw-car-wing" />
      {extra}
    </svg>
  )
}
