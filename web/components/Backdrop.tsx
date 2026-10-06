// Light trails: a long-exposure shot of a corner. A bundle of glowing streaks sweeps up across
// the page — orange and red tail-lights, blue and white headlights, a few broken where a car
// braked. `vivid` sits behind the sign-in card; `ambient` is a softened copy behind the app
// shell, seen through the glass sidebar and dimmed between the cards. Static: the layer slides
// in once on load (timed by --motion, so "Off" shows it at once) and never moves again.
//
// No SVG or CSS filters, no masks: the glow is a few wide, faint strokes under each line and the
// fade is a gradient on the strokes. Safari re-runs filters whenever the page repaints, which
// made a blurred version stutter there; plain strokes cost next to nothing in every browser.

const TONES = ['brand', 'red', 'blue', 'white', 'purple'] as const
type Tone = (typeof TONES)[number]

const TONE_COLOR: Record<Tone, string> = {
  brand: 'var(--brand-500)',
  red: 'var(--red-500)',
  blue: 'var(--blue-500)',
  white: 'var(--blue-100)',
  purple: 'var(--purple-500)',
}

const TRAILS: ReadonlyArray<{ offset: number; tone: Tone; width: number; broken?: true }> = [
  { offset: -60, tone: 'blue', width: 1.5 },
  { offset: -30, tone: 'white', width: 2.5 },
  { offset: 0, tone: 'brand', width: 4 },
  { offset: 18, tone: 'brand', width: 2, broken: true },
  { offset: 40, tone: 'red', width: 3 },
  { offset: 70, tone: 'brand', width: 1.5 },
  { offset: 110, tone: 'purple', width: 2, broken: true },
  { offset: 150, tone: 'blue', width: 1 },
  { offset: 200, tone: 'brand', width: 1 },
]

// The strokes drawn per trail, widest first: halo layers (width × scale, faint) and, on
// sign-in, the sharp line on top. The ambient copy has only halos, which reads as blurred.
const LAYERS: Record<'vivid' | 'ambient', ReadonlyArray<{ scale: number; opacity: number }>> = {
  vivid: [
    { scale: 16, opacity: 0.04 },
    { scale: 9, opacity: 0.07 },
    { scale: 5, opacity: 0.12 },
    { scale: 2.5, opacity: 0.25 },
    { scale: 1, opacity: 1 },
  ],
  ambient: [
    { scale: 28, opacity: 0.04 },
    { scale: 18, opacity: 0.06 },
    { scale: 10, opacity: 0.09 },
    { scale: 5, opacity: 0.12 },
  ],
}

// One curve, shifted per trail; the shift narrows towards the top right so the bundle converges.
const trail = (offset: number) =>
  `M -200 ${900 + offset} C 300 ${880 + offset}, 600 ${640 + offset * 0.6}, 900 ${420 + offset * 0.4} S 1500 ${120 + offset * 0.3}, 1900 ${80 + offset * 0.2}`

// On sign-in the trails fade in from the bottom-left corner and thin out at the top right;
// behind the shell they must reach the bottom-left corner, where the sidebar is.
const FADE = {
  vivid: [
    { offset: '0%', opacity: 0 },
    { offset: '35%', opacity: 1 },
    { offset: '80%', opacity: 1 },
    { offset: '100%', opacity: 0.1 },
  ],
  ambient: [
    { offset: '0%', opacity: 1 },
    { offset: '100%', opacity: 1 },
  ],
} as const

export default function Backdrop({ tone }: { tone: 'vivid' | 'ambient' }) {
  // Both tones never share a page, but distinct ids keep the SVG references unambiguous.
  const gradient = (color: Tone) => `backdrop-${tone}-${color}`
  return (
    <svg className="backdrop" data-tone={tone} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        {TONES.map((color) => (
          <linearGradient key={color} id={gradient(color)} gradientUnits="userSpaceOnUse" x1="0" y1="1000" x2="1600" y2="0">
            {FADE[tone].map((stop) => (
              <stop key={stop.offset} offset={stop.offset} style={{ stopColor: TONE_COLOR[color], stopOpacity: stop.opacity }} />
            ))}
          </linearGradient>
        ))}
      </defs>
      {LAYERS[tone].map((layer) => (
        <g key={layer.scale} strokeOpacity={layer.opacity}>
          {TRAILS.map((t) => (
            <path
              key={t.offset}
              d={trail(t.offset)}
              pathLength={1}
              className={t.broken ? 'backdrop-trail broken' : 'backdrop-trail'}
              stroke={`url(#${gradient(t.tone)})`}
              strokeWidth={t.width * layer.scale}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}
