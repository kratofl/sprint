import type { CSSProperties } from 'react'
import { classTone, type CarMarks } from '../carMarks'
import { makerColors, makerKey } from './makerBadge'
import './CarBadges.css'

const FLAGS = import.meta.glob<string>('../assets/flags/*.svg', { eager: true, import: 'default' })
// Maker marks, each file named after the make in lower-case letters only ("Mercedes-AMG" → mercedesamg.svg).
const MAKERS = import.meta.glob<string>('../assets/makers/*.svg', { eager: true, import: 'default' })

/**
 * A class as racing tags it, solid in its class colour ("HYP" red, "LMP2" blue, …); a class without
 * one stays neutral. ELMS's LMP2 reads just "LMP2": its orange corner says ELMS, and the tooltip
 * and accessible name still spell it out.
 */
export function ClassTag({ tag }: { tag: string }) {
  const shown = tag === 'LMP2 ELMS' ? 'LMP2' : tag
  return (
    <span className={`chip class-tag ${classTone(tag)}`} title={shown === tag ? undefined : tag} aria-label={tag}>
      {shown}
    </span>
  )
}

/**
 * The maker's badge: its mark, or its first letter for a maker Sprint has no mark for, on the
 * maker's primary colour in whichever ink reads better there; neutral for a maker without a colour.
 * `small` for a menu row.
 */
export function MakerLogo({ make, small = false }: { make: string | null; small?: boolean }) {
  const src = make ? MAKERS[`../assets/makers/${makerKey(make)}.svg`] : undefined
  const colors = makerColors(make)
  const style: CSSProperties | undefined = colors ? { backgroundColor: colors.fill } : undefined
  return (
    <span className={`logo-badge${small ? ' small' : ''}${colors ? ` branded ink-${colors.ink}` : ''}`} style={style} aria-hidden="true">
      {src ? <span className="logo-mark" style={{ maskImage: `url("${src}")` }} /> : (make ?? '?').slice(0, 1)}
    </span>
  )
}

/** "Porsche 963 · Spa" with the track's flag before it (none for a track the catalog does not know). */
export function CarAtTrack({ car, track, country }: { car: string; track: string; country: string | null }) {
  return (
    <span className="car-at-track">
      {car} · {country && <Flag country={country} />}
      {track}
    </span>
  )
}

/**
 * A car in a line of text: its maker's logo, the car, its class tag. No logo for a car whose make
 * is not known and no tag for a class that is not, rather than a "?" mid-sentence.
 */
export function CarName({ marks }: { marks: CarMarks }) {
  return (
    <span className="car-name">
      {marks.make && <MakerLogo make={marks.make} small />}
      <span className="car-name-text">{marks.car}</span>
      {marks.classTag && <ClassTag tag={marks.classTag} />}
    </span>
  )
}

/** A track in a line of text, its flag before it (none for a track the catalog does not know). */
export function TrackName({ track, country }: { track: string; country: string | null }) {
  return (
    <span className="car-name">
      {country && <Flag country={country} />}
      <span className="car-name-text">{track}</span>
    </span>
  )
}

/** The track's country flag, or a blank of its size for a track the catalog does not know. */
export function Flag({ country }: { country: string | null }) {
  const src = country ? FLAGS[`../assets/flags/${country.toLowerCase()}.svg`] : undefined
  return src ? <img className="track-flag" src={src} alt="" width={18} height={12} /> : <span className="track-flag blank" aria-hidden="true" />
}
