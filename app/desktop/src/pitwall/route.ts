/** Which pit wall window this renderer is (`?pitwall=`, electron/pitWallWindows.ts). */
export type PitWallRoute = { kind: 'main' } | { kind: 'page' | 'tile'; id: string }

/** Reads `?pitwall=main|page:<id>|tile:<id>`; null for any other window. */
export function pitWallRoute(search: string): PitWallRoute | null {
  const value = new URLSearchParams(search).get('pitwall')
  if (value === 'main') return { kind: 'main' }
  const match = value ? /^(page|tile):(.+)$/.exec(value) : null
  if (!match) return null
  return match[1] === 'page' ? { kind: 'page', id: match[2] } : { kind: 'tile', id: match[2] }
}
