// Retakes the README's screenshots (repo-root assets/screenshots/<name>-dark|light.png) from the
// preview harness and its made-up sample state, so they never show a real driver. Build the
// preview first (node scripts/preview/build-preview.mjs), then run from app/desktop:
//   node scripts/preview/readme-shots.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../../../../assets/screenshots')

/** Each shot: its file name, the page and the clicks that set it up (preview README → Query parameters). */
const SHOTS = [
  { name: 'overview', view: 'Home' },
  { name: 'session-plan', view: 'SessionPlanner', query: 'click=.planner-upnext .button' },
  { name: 'on-track', view: 'OnTrack' },
  { name: 'analysis', view: 'Analysis', query: 'click=.analysis-lap-open&click=.analysis-lap-actions [aria-haspopup=menu]&click=.analysis-pick-row:last-of-type' },
  { name: 'dashes', view: 'Dashes' },
  { name: 'device', view: 'Devices', query: 'click=.devices-tile' },
  { name: 'pit-wall', view: 'Home', query: 'pitwall=main', size: '1920,1080' },
]

// The sidebar shows the newest release, not the placeholder version in package.json and the sample.
const tag = spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', '--exclude', '*-*'], { encoding: 'utf8' })
const version = tag.status === 0 ? tag.stdout.trim().replace(/^v/, '') : null
if (!version) console.warn('no release tag found: the screenshots show the sample version')

mkdirSync(out, { recursive: true })
let failed = false
for (const shot of SHOTS) {
  for (const theme of ['dark', 'light']) {
    const file = join(out, `${shot.name}-${theme}.png`)
    const args = [join(here, 'screenshot.mjs'), '--view', shot.view, '--theme', theme, '--size', shot.size ?? '1440,900', '--out', file]
    const query = [shot.query, version && `version=${version}`].filter(Boolean).join('&')
    if (query) args.push('--query', query)
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(`failed: ${shot.name} (${theme})`)
      failed = true
    }
  }
}
process.exit(failed ? 1 : 0)
