/**
 * How a car and its track are shown (host: `CarMarks`): the car as it reads beside its class tag
 * ("Porsche 963"), the class tag, the make for the maker's logo and the track's country (ISO 3166-1
 * alpha-2) for its flag. Null where the host could not tell. Drawn by CarName and TrackName
 * (views/CarBadges.tsx).
 */
export type CarMarks = { car: string; classTag: string | null; make: string | null; country: string | null }

/**
 * The class's colour class ("class-hyp", views/CarBadges.css): on a tag it paints the tag; on
 * anything else it only sets `--tag` to the class colour, for a rail, edge or dot in it (unset for a
 * class without a colour).
 */
export const classTone = (tag: string): string => `class-${tag.toLowerCase().replace(/\s+/g, '-')}`

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/** Narrows the host's `CarMarks`; `car` is what to show when it sent none (an older host). */
export function parseCarMarks(value: unknown, car: string): CarMarks {
  if (typeof value !== 'object' || value === null) return { car, classTag: null, make: null, country: null }
  const marks: Record<string, unknown> = { ...value }
  return { car: text(marks.car) ?? car, classTag: text(marks.classTag), make: text(marks.make), country: text(marks.country) }
}
