/**
 * Which build is running, for the sidebar's tag and version line. A dev run (Vite's dev
 * server) names its git branch, since its version is always the 0.1.0 placeholder and the
 * branch tells worktrees apart. A packaged build is a pre-release when its version carries a
 * suffix (0.2.1-alpha.1), stable otherwise. Stable builds get no tag.
 */
export type RunningBuild =
  | { kind: 'development'; branch: string | null }
  | { kind: 'pre-release'; version: string }
  | { kind: 'stable'; version: string }

/** Null while a packaged build's version is still unknown (the host has not answered yet). */
export function describeBuild(dev: boolean, branch: string | null, version: string | null): RunningBuild | null {
  if (dev) return { kind: 'development', branch }
  if (version === null) return null
  return version.includes('-') ? { kind: 'pre-release', version } : { kind: 'stable', version }
}
