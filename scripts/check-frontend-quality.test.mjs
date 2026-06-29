import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checker = path.join(repoRoot, 'scripts', 'check-frontend-quality.mjs')

async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'sprint-frontend-quality-'))
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, source, 'utf8')
  }
  return root
}

function run(root, args = ['--audit']) {
  const result = spawnSync(process.execPath, [checker, ...args, '--root', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: `${result.stdout}\n${result.stderr}`,
  }
}

test('audit reports frontend UX and design violations', async () => {
  const root = await fixture({
    'app/frontend/src/ButtonLike.tsx': `
      import { XIcon } from 'lucide-react'
      export function Bad() {
        return <div onClick={() => alert('x')} style={{ color: '#4F9CFF', backdropFilter: 'blur(8px)' }}>x</div>
      }
    `,
  })

  const result = run(root)

  assert.equal(result.status, 1)
  assert.match(result.stdout, /no-lucide-runtime/)
  assert.match(result.stdout, /no-raw-hex/)
  assert.match(result.stdout, /no-retired-graphite/)
  assert.match(result.stdout, /no-clickable-div/)
  assert.match(result.stdout, /no-blur-surface/)
})

test('audit allows tokens and brand assets', async () => {
  const root = await fixture({
    'packages/tokens/src/graphite.ts': `export const color = '#FF6A00'`,
    'packages/ui/src/assets/brand/sprint-icon.svg': `<svg><stop stop-color="#FF6A00" /></svg>`,
  })

  const result = run(root)

  assert.equal(result.status, 0, result.output)
})

test('audit ignores comments and explicitly allowed test assertions', async () => {
  const root = await fixture({
    'app/frontend/src/lib/dash/types.ts': `// PRD #106 #7/#8 should not be treated as colors`,
    'packages/tokens/src/tokenHierarchy.test.ts': `assert.doesNotMatch(source, /IBM Plex Sans/)`,
    'app/frontend/src/components/widgetPreview/colorResolution.ts': `
      export const fonts = 'Bahnschrift, IBM Plex Sans Condensed, IBM Plex Sans, sans-serif'
    `,
  })

  const result = run(root)

  assert.equal(result.status, 0, result.output)
})

test('strict mode allows baseline violations and fails new violations', async () => {
  const root = await fixture({
    'app/frontend/src/Existing.tsx': `export const color = '#123456'`,
    'app/frontend/src/New.tsx': `export const color = '#654321'`,
    'scripts/frontend-quality-baseline.json': JSON.stringify({
      version: 1,
      violations: [
        {
          id: 'no-raw-hex|app/frontend/src/Existing.tsx|1|#123456',
          rule: 'no-raw-hex',
          path: 'app/frontend/src/Existing.tsx',
          line: 1,
          match: '#123456',
        },
      ],
    }),
  })

  const result = run(root, ['--strict'])

  assert.equal(result.status, 1)
  assert.doesNotMatch(result.output, /Existing.tsx/)
  assert.match(result.output, /New.tsx/)
})
