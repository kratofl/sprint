import type { Viewer } from './records'

// How the app names the signed-in user: the display name, else the email (which a
// Discord account does not have).
export function viewerName(viewer: Viewer): string {
  return viewer.displayName.trim() || viewer.email || 'Sprint user'
}

// Up to two initials for the avatar: "Alex Morgan" → "AM", "alex@x.de" → "A".
export function initials(name: string): string {
  const words = name.split(/[\s@._-]+/).filter(Boolean)
  const letters = name.includes('@') ? words.slice(0, 1) : words.slice(0, 2)
  return letters.map((word) => word[0].toUpperCase()).join('')
}
