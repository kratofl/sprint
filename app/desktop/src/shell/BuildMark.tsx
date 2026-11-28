import type { SprintState } from '../bridge'
import sprintMark from '../assets/sprint-mark.svg'
import sprintMarkBeta from '../assets/sprint-mark-beta.svg'
import sprintMarkDev from '../assets/sprint-mark-dev.svg'
import { parseUpdatesInfo } from '../views/SettingsUpdates'
import { describeBuild, type RunningBuild } from './build'

/** The build this window runs: Vite's dev flag and branch, else the host's version. Null until a packaged build's version is known. */
export const currentBuild = (sprint: SprintState | null): RunningBuild | null =>
  describeBuild(import.meta.env.DEV, __SPRINT_DEV_BRANCH__, sprint ? (parseUpdatesInfo(sprint)?.version ?? null) : null)

const MARKS: Record<RunningBuild['kind'], { src: string; alt: string }> = {
  development: { src: sprintMarkDev, alt: 'Sprint, development build' },
  'pre-release': { src: sprintMarkBeta, alt: 'Sprint beta' },
  stable: { src: sprintMark, alt: 'Sprint' },
}

/**
 * The Sprint mark at the top of a rail, in the build's colour as its app icon is: red for a dev
 * run, green for a beta, orange for stable (and while the version is still unknown).
 */
export function BuildMark({ build }: { build: RunningBuild | null }) {
  const mark = MARKS[build?.kind ?? 'stable']
  return <img src={mark.src} alt={mark.alt} />
}
