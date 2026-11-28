import { compoundLetter } from '../pitwall/timing'
import './TyreMark.css'

/** The class that colours a compound by its kind (TyreMark.css): soft red, medium yellow, wet blue, intermediate green, hard plain. */
const kind = (compound: string | null): string => `t-${compoundLetter(compound)?.toLowerCase() ?? 'none'}`

/** One compound as a ringed letter coloured by its kind: the pit wall's timing and Analysis's laps. */
export function TyreChip({ compound }: { compound: string | null }) {
  const letter = compoundLetter(compound)
  if (!letter) return <span />
  return (
    <span className={`tyre-chip ${kind(compound)}`} title={compound ?? undefined}>
      {letter}
    </span>
  )
}

/**
 * The tyres a lap ran on: one chip when all four are the same compound; otherwise the four tyres
 * as dots in the car's layout (front left, front right, rear left, rear right), each in its
 * compound's colour. A lap records one compound per axle, so the front two dots share one colour
 * and the rear two the other. Its name in full is the title, for the pointer and screen readers.
 */
export function TyreSet({ front, rear, label }: { front: string | null; rear: string | null; label: string }) {
  if (front === rear || front === null || rear === null) return <TyreChip compound={front ?? rear} />
  const dot = (compound: string, place: string) => <span key={place} className={`tyre-dot ${kind(compound)}`} />
  return (
    <span className="tyre-dots" role="img" aria-label={label} title={label}>
      {[dot(front, 'fl'), dot(front, 'fr'), dot(rear, 'rl'), dot(rear, 'rr')]}
    </span>
  )
}
