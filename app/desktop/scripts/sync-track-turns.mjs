// Refreshes src/assets/tracks/lmu-turns.json from Lovely Track Data (see that folder's README).
// Run by hand when the data gains tracks or fixes: `node app/desktop/scripts/sync-track-turns.mjs`.
// Keeps only what Analysis reads: each LMU track's turn numbers at their apex, as a share of the lap.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://raw.githubusercontent.com/Lovely-Sim-Racing/lovely-track-data/main/data'
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/tracks/lmu-turns.json')

async function json(path) {
  const response = await fetch(`${SOURCE}/${path}`)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json()
}

const manifest = await json('manifest.json')
const turns = {}
for (const entry of manifest.tracks.lmu) {
  const track = await json(entry.path)
  const numbered = (track.turn ?? [])
    .filter((turn) => Number.isInteger(turn.number) && typeof turn.marker === 'number' && turn.marker >= 0 && turn.marker <= 1)
    .map((turn) => ({ number: turn.number, at: turn.marker }))
  // The data's track id is LMU's own track name in lower case, which Analysis matches against.
  if (numbered.length > 0) turns[track.trackId.toLowerCase()] = numbered
}

const sorted = Object.fromEntries(Object.keys(turns).sort().map((key) => [key, turns[key]]))
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`)
console.log(`${Object.keys(sorted).length} tracks → ${out}`)
