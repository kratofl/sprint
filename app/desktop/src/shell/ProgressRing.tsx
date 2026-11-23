import type { ReactNode, Ref } from 'react'

/**
 * The ring itself, `size` px across: a track, and filled to `percent` when there is one (null
 * draws the bare track, as Settings does around its check button while it checks). Decorative;
 * whatever shows it carries the words.
 */
export function RingGauge({ size, percent }: { size: number; percent: number | null }) {
  const centre = size / 2
  // Room for the 2px stroke inside the box.
  const radius = centre - 1.5
  const length = 2 * Math.PI * radius
  return (
    <svg className="progress-ring-gauge" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="progress-ring-track" cx={centre} cy={centre} r={radius} />
      {percent !== null && <circle className="progress-ring-fill" cx={centre} cy={centre} r={radius} strokeDasharray={length} strokeDashoffset={length * (1 - percent / 100)} />}
    </svg>
  )
}

/**
 * A ring that fills with progress of a known size (the update download), `size` px across in a
 * 28px box; `children` (an icon) sits in its middle. The title bar's update indicator and the
 * Updates row in Settings both draw the download with it.
 */
export function ProgressRing({ percent, label, size = 16, ref, children }: { percent: number; label: string; size?: number; ref?: Ref<HTMLSpanElement>; children?: ReactNode }) {
  return (
    <span ref={ref} className="progress-ring" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${label} · ${percent}%`}>
      <RingGauge size={size} percent={percent} />
      {children}
    </span>
  )
}
