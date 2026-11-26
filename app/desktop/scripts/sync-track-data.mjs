// Refreshes Sprint's copy of Lovely Track Data (see src/assets/tracks/README.md): each LMU track's
// turns (src/assets/tracks/lmu-turns.json, for Analysis) and its typical pit loss per class
// (Sprint.Games/LeMansUltimate/lmu-pit-loss.json, for the dash and the pit wall until a stop is
// measured). Run by hand when the data gains tracks or fixes: `node app/desktop/scripts/sync-track-data.mjs`.
// Keeps only what Sprint reads.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://raw.githubusercontent.com/Lovely-Sim-Racing/lovely-track-data/main/data'
const here = dirname(fileURLToPath(import.meta.url))
const turnsOut = join(here, '../src/assets/tracks/lmu-turns.json')
const pitOut = join(here, '../../Sprint.Games/LeMansUltimate/lmu-pit-loss.json')

async function json(path) {
  const response = await fetch(`${SOURCE}/${path}`)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json()
}

const seconds = (entries, name) => {
  const entry = Array.isArray(entries) ? entries.find((candidate) => candidate?.name === name) : undefined
  return typeof entry?.time === 'number' && entry.time > 0 ? entry.time : null
}

// A class's "dt" is what a drive-through loses, its "pit" what a typical race stop loses, both
// against staying on track; kept only with both, and only when the stop costs at least the drive-through.
function pitTimes(track) {
  const block = Array.isArray(track.time) ? track.time[0] : track.time
  const classes = {}
  for (const [carClass, entries] of Object.entries(block ?? {})) {
    const dt = seconds(entries, 'dt')
    const pit = seconds(entries, 'pit')
    if (dt !== null && pit !== null && pit >= dt) classes[carClass.toLowerCase()] = { dt, pit }
  }
  return classes
}

const sortedByKey = (record) => Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]))

const manifest = await json('manifest.json')
const turns = {}
const pit = {}
for (const entry of manifest.tracks.lmu) {
  const track = await json(entry.path)
  // The data's track id is LMU's own track name in lower case, which Sprint matches against.
  const id = track.trackId.toLowerCase()
  const numbered = (track.turn ?? [])
    .filter((turn) => Number.isInteger(turn.number) && typeof turn.marker === 'number' && turn.marker >= 0 && turn.marker <= 1)
    .map((turn) => ({ number: turn.number, at: turn.marker }))
  if (numbered.length > 0) turns[id] = numbered
  const classes = pitTimes(track)
  if (Object.keys(classes).length > 0) pit[id] = sortedByKey(classes)
}

const write = (out, record) => {
  const sorted = sortedByKey(record)
  writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`)
  console.log(`${Object.keys(sorted).length} tracks → ${out}`)
}
write(turnsOut, turns)
write(pitOut, pit)
