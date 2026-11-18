// Picks the next release tag. The release workflow (.github/workflows/release.yml) runs it,
// tags the result and builds that tag:
//
//   node scripts/next-version.mjs <stable|pre-release>
//
// The bump comes from the PRs merged since the last stable release: any labelled type/breaking makes
// it major, else any labelled type/feature makes it minor, else it is a patch. It is measured from
// that stable release, so pressing "pre-release" again keeps counting up the same line
// (v1.0.1-beta.1, -beta.2, ...) and "stable" then promotes it (v1.0.1). Needs git and gh.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/
const CHANNELS = ['stable', 'pre-release']
const FEATURE = 'type/feature'
const BREAKING = 'type/breaking'

/** A release tag as numbers, or null for any tag that is not one (`pre` is null when stable). */
export function parseTag(tag) {
  const match = TAG.exec(tag)
  if (!match) return null
  const [, major, minor, patch, label, n] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    pre: label === undefined ? null : { label, n: Number(n) },
  }
}

export function formatTag(version) {
  const core = `v${version.major}.${version.minor}.${version.patch}`
  return version.pre ? `${core}-${version.pre.label}.${version.pre.n}` : core
}

/** The bump a batch of merged PRs needs: the biggest any of them asks for. */
export function bumpFor(labelSets) {
  const labels = labelSets.flat()
  return labels.includes(BREAKING) ? 'major' : labels.includes(FEATURE) ? 'minor' : 'patch'
}

/**
 * The release already tagged on the commit being released, which a second run must not repeat. A
 * stable tag on a commit that only has a beta is the beta being promoted, so that one is allowed.
 */
export function releasedAtHead(headTags, channel) {
  const releases = headTags.filter((tag) => parseTag(tag) !== null)
  return (channel === 'stable' ? releases.filter((tag) => parseTag(tag).pre === null) : releases)[0] ?? null
}

/** Semver precedence for the tags we cut: a pre-release sorts below its own stable release. */
export function compare(a, b) {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch
  if (core !== 0) return core
  if (!a.pre || !b.pre) return (a.pre ? -1 : 0) - (b.pre ? -1 : 0)
  return a.pre.label.localeCompare(b.pre.label) || a.pre.n - b.pre.n
}

/** The last stable release tag, or null before the first one. */
export function lastStableTag(tags) {
  const stable = newest(tags.map(parseTag).filter((version) => version?.pre === null))
  return stable === null ? null : formatTag(stable)
}

/**
 * The tag to cut next. Throws when that tag would not be the newest release, because installed
 * apps only ever update forward (a label taken off a PR after its beta shipped, say).
 */
export function nextTag(tags, channel, bump) {
  const versions = tags.map(parseTag).filter((version) => version !== null)
  const base = newest(versions.filter((v) => v.pre === null)) ?? { major: 0, minor: 0, patch: 0, pre: null }
  const core =
    bump === 'major'
      ? { major: base.major + 1, minor: 0, patch: 0 }
      : bump === 'minor'
        ? { major: base.major, minor: base.minor + 1, patch: 0 }
        : { major: base.major, minor: base.minor, patch: base.patch + 1 }

  let next = { ...core, pre: null }
  if (channel === 'pre-release') {
    const betas = versions.filter((v) => v.pre?.label === 'beta' && compare({ ...v, pre: null }, next) === 0)
    next = { ...core, pre: { label: 'beta', n: Math.max(0, ...betas.map((v) => v.pre.n)) + 1 } }
  }

  const latest = newest(versions)
  if (latest !== null && compare(next, latest) <= 0) {
    throw new Error(
      `${formatTag(next)} (${bump}) would not be newer than ${formatTag(latest)}. ` +
        `Is a PR merged since the last stable release missing its ${FEATURE} or ${BREAKING} label?`,
    )
  }
  return formatTag(next)
}

function newest(versions) {
  return versions.reduce((best, v) => (best === null || compare(v, best) > 0 ? v : best), null)
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [channel] = process.argv.slice(2)
  if (!CHANNELS.includes(channel)) {
    console.error(`usage: node scripts/next-version.mjs <${CHANNELS.join('|')}>`)
    process.exit(2)
  }

  const lines = (text) => text.split('\n').filter((line) => line !== '')
  const tags = lines(run('git', ['tag', '--list', 'v*']))
  const repeat = releasedAtHead(lines(run('git', ['tag', '--points-at', 'HEAD'])), channel)
  if (repeat !== null) {
    console.error(`This commit is already released as ${repeat}. To retry a failed build, re-run its jobs instead.`)
    process.exit(1)
  }

  // Only labelled PRs change the bump, so ask GitHub for those merged since the last stable release
  // and keep the ones whose merge commit is on this side of it. The merge commit works for squash,
  // merge and rebase merges alike (for a rebase it is the last rebased commit); the date only
  // narrows the search.
  const since = lastStableTag(tags)
  const commits = new Set(lines(run('git', ['rev-list', since ? `${since}..HEAD` : 'HEAD'])))
  const after = since ? ` merged:>=${run('git', ['log', '-1', '--format=%cs', since]).trim()}` : ''
  const labelled = JSON.parse(
    run('gh', [
      'pr', 'list', '--state', 'merged', '--limit', '1000', '--json', 'number,labels,mergeCommit',
      '--search', `label:"${FEATURE}","${BREAKING}"${after}`,
    ]),
  ).filter((pr) => pr.mergeCommit !== null && commits.has(pr.mergeCommit.oid))
  const bump = bumpFor(labelled.map((pr) => pr.labels.map((label) => label.name)))

  // To stderr, so the workflow log says why; stdout carries only the tag.
  const reasons = labelled.map((pr) => `#${pr.number} (${pr.labels.map((label) => label.name).join(', ')})`)
  console.error(
    `${bump}: ${commits.size} commits since ${since ?? 'the first commit'}` +
      (reasons.length > 0 ? `, labelled ${reasons.join(' ')}` : ', no labelled PRs'),
  )

  try {
    console.log(nextTag(tags, channel, bump))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
