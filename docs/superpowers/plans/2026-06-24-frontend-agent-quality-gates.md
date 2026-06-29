# Frontend Agent Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce agent-caused frontend defects by adding repo-native quality gates for frontend correctness, UX regressions, and design drift.

**Architecture:** Add a small Node-based guardrail checker that runs in audit and strict modes, a concise frontend quality contract for agents, package scripts, and CI wiring. Existing TypeScript, Vitest, and source-assertion tests remain, but UI-impacting work must also pass static UX/design guards and produce visual verification evidence.

**Tech Stack:** Node ESM scripts, pnpm workspaces, Turbo, TypeScript, Vitest, Testing Library, GitHub Actions. Playwright visual checks are introduced as a second-stage gate after the static guardrail baseline exists.

---

## Scope

This is not only a design-system guard. It covers:

- Frontend code correctness: unsafe Wails bridge assumptions, direct runtime access in components, missing loading/error/empty states, lost behavior during visual rewrites.
- UX quality: inaccessible clickable elements, icon-only controls without names, missing keyboard behavior, layout overflow risks, hidden focus states, destructive actions without confirmation.
- Design drift: raw hex, retired Graphite values, wrong icon library, blur/glow/gradient surfaces, local primitives where `packages/ui` should be used.

The gate starts in `audit` mode to record current debt and `strict` mode to block new violations.

## File Structure

- Create `docs/FRONTEND_QUALITY.md`
  - Canonical frontend-agent contract: how agents plan, implement, test, and visually verify frontend changes.
- Create `docs/templates/frontend-change-contract.md`
  - Short template agents fill for UI/UX/frontend changes.
- Modify `AGENTS.md`
  - Add one short reference to `docs/FRONTEND_QUALITY.md` under Frontend Code Structure or UI Rules.
- Create `scripts/check-frontend-quality.mjs`
  - Repo-native scanner with `--audit`, `--strict`, `--update-baseline`, and `--changed-only` modes.
- Create `scripts/check-frontend-quality.test.mjs`
  - Node test fixtures for the scanner.
- Create `scripts/frontend-quality-baseline.json`
  - Current accepted violations by stable id. Strict mode fails only on violations not in this file.
- Modify `package.json`
  - Add root scripts for audit and strict quality checks.
- Modify `app/frontend/package.json`
  - Add a package-local `quality` script that composes type-check, tests, and strict frontend quality.
- Modify `.github/workflows/ci.yml`
  - Add the strict frontend quality check to the TypeScript CI job.

---

### Task 1: Frontend Quality Contract

**Files:**
- Create: `docs/FRONTEND_QUALITY.md`
- Create: `docs/templates/frontend-change-contract.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create the frontend quality contract**

Create `docs/FRONTEND_QUALITY.md` with this content:

```markdown
# Frontend Quality Contract

This document is the working contract for agents changing Sprint frontend code.
It covers desktop React, shared UI, tokens, and any web frontend work that changes
user-facing behavior.

## Required Pre-Work

Before editing frontend code, write a short contract in the task notes or PR:

- Screen or component being changed.
- User workflow affected.
- Existing components and helpers that must be reused.
- States that must remain or be added: loading, empty, error, disabled, selected,
  focus, hover, destructive confirmation.
- Runtime boundaries: Wails calls, DTO adapters, generated bindings, mock data,
  and fallback behavior.
- Protected behavior from the current implementation.
- Verification commands and visual checks to run.

## Implementation Rules

- Prefer `packages/ui` primitives and `packages/tokens` values before local UI.
- Keep branching logic in `*State.ts` or `*ViewModel.ts` files with tests.
- Keep `.tsx` components presentational unless the existing pattern for that
  feature already owns local controller logic.
- Coalesce Wails array results with `?? []` before `.map`, `.filter`, or iteration.
- Do not import generated `wailsjs/go/models.ts`; map Go JSON in adapters.
- Do not access `window.go` directly from components. Use existing runtime APIs.
- Do not remove existing visible states or actions during visual rewrites.
- Icon-only controls need an accessible name.
- Clickable non-button elements need role, tabIndex, and keyboard activation, or
  should be replaced with a real button.
- Destructive actions need confirmation unless the existing flow already provides
  an undo path.

## Design Rules

- Use `docs/DESIGN.md` and `docs/figma-spec/SPEC.md` for the product language.
- Do not add raw hex outside tokens, brand assets, and explicitly allowed tests.
- Do not revive retired Graphite values or IBM Plex desktop UI usage.
- Use `@tabler/icons-react` for runtime icons. Do not add new `lucide-react`
  imports.
- Do not add glass, glow, blur, or gradient surfaces. Brand assets are exempt.
- Keep layouts dense, scannable, keyboard-operable, and explicit about state.

## Required Verification

Run the smallest relevant checks, plus the frontend quality gate:

```powershell
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop test
pnpm check:frontend-quality
```

For visual or workflow changes, also capture screenshots in desktop and narrow
viewports. If the screen depends on Wails data, use `wails dev` or a deliberate
mock of `window.go`; do not judge data-driven screens from an empty localhost
fallback.
```

- [ ] **Step 2: Create the frontend change contract template**

Create `docs/templates/frontend-change-contract.md`:

```markdown
# Frontend Change Contract

## Target

- Screen/component:
- User workflow:
- Files expected to change:

## Existing Behavior To Preserve

- 

## States Required

- Loading:
- Empty:
- Error:
- Disabled:
- Selected/focus/hover:
- Destructive confirmation:

## Reuse Plan

- `packages/ui` primitives:
- `packages/tokens` values:
- Existing helpers/controllers:

## Runtime Boundaries

- Wails calls:
- DTO adapters:
- Mock/fallback behavior:

## Verification

- Type-check:
- Tests:
- Frontend quality gate:
- Visual screenshots:
```

- [ ] **Step 3: Reference the contract from `AGENTS.md`**

Add this bullet under `## Frontend Code Structure`:

```markdown
- For frontend or UX changes, follow `docs/FRONTEND_QUALITY.md` before editing:
  write a short change contract, preserve existing behavior, reuse shared UI and
  tokens, and run the frontend quality gate.
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add AGENTS.md docs/FRONTEND_QUALITY.md docs/templates/frontend-change-contract.md
git commit -m "docs: add frontend quality contract"
```

Expected: commit succeeds.

---

### Task 2: Guardrail Scanner Tests

**Files:**
- Create: `scripts/check-frontend-quality.test.mjs`
- Create later in Task 3: `scripts/check-frontend-quality.mjs`

- [ ] **Step 1: Write failing scanner tests**

Create `scripts/check-frontend-quality.test.mjs`:

```js
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
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

function run(root, args = ['--audit', '--root']) {
  const result = spawnSync(process.execPath, [checker, ...args, root], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
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

  assert.equal(result.status, 0, result.stdout + result.stderr)
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

  const result = run(root, ['--strict', '--root', root])

  assert.equal(result.status, 1)
  assert.doesNotMatch(result.stdout, /Existing.tsx/)
  assert.match(result.stdout, /New.tsx/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test scripts/check-frontend-quality.test.mjs
```

Expected: FAIL with module-not-found or missing `scripts/check-frontend-quality.mjs`.

- [ ] **Step 3: Commit**

Run:

```powershell
git add scripts/check-frontend-quality.test.mjs
git commit -m "test: cover frontend quality guardrails"
```

Expected: commit succeeds with a failing test intentionally introduced for the next task.

---

### Task 3: Guardrail Scanner Implementation

**Files:**
- Create: `scripts/check-frontend-quality.mjs`
- Test: `scripts/check-frontend-quality.test.mjs`

- [ ] **Step 1: Implement the scanner**

Create `scripts/check-frontend-quality.mjs`:

```js
#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.jsx', '.json', '.md', '.mjs', '.svg', '.ts', '.tsx'])
const DEFAULT_SCAN_DIRS = ['app/frontend/src', 'packages/ui/src', 'packages/tokens/src', 'web/src']
const BASELINE_PATH = 'scripts/frontend-quality-baseline.json'

const rules = [
  {
    name: 'no-lucide-runtime',
    pattern: /from\s+['"]lucide-react['"]|require\(['"]lucide-react['"]\)/g,
    message: 'Use @tabler/icons-react for runtime UI icons.',
    allow: (file) => file.includes('/node_modules/') || file.includes('/dist/'),
  },
  {
    name: 'no-retired-graphite',
    pattern: /#070707|#0D0D0D|#131313|#F5483D|#4F9CFF|IBM Plex Sans/g,
    message: 'Retired desktop design values must not be reintroduced.',
    allow: (file) => file.startsWith('docs/'),
  },
  {
    name: 'no-raw-hex',
    pattern: /#[0-9A-Fa-f]{3,8}\b/g,
    message: 'Use packages/tokens values instead of raw hex.',
    allow: (file) =>
      file.startsWith('packages/tokens/src/') ||
      file.includes('/assets/brand/') ||
      file.endsWith('.test.ts') ||
      file.endsWith('.test.tsx') ||
      file.endsWith('.test.mjs'),
  },
  {
    name: 'no-blur-surface',
    pattern: /backdrop-filter\s*:|backdropFilter\s*:|filter\s*:\s*['"]?blur\(|filter:\s*blur\(/g,
    message: 'Blurred/glass surfaces are outside the Sprint product language.',
    allow: (file) => file.includes('/assets/brand/'),
  },
  {
    name: 'no-gradient-surface',
    pattern: /linear-gradient\(|radial-gradient\(|conic-gradient\(/g,
    message: 'Gradients are reserved for brand assets, not app surfaces.',
    allow: (file) => file.includes('/assets/brand/'),
  },
  {
    name: 'no-clickable-div',
    pattern: /<div\b(?=[^>]*\bonClick=)(?![^>]*\brole=)(?![^>]*\btabIndex=)/g,
    message: 'Clickable divs need role and keyboard access, or should be buttons.',
    allow: () => false,
  },
  {
    name: 'no-direct-window-go-in-components',
    pattern: /window\.go/g,
    message: 'Use frontend runtime APIs instead of direct Wails access in UI code.',
    allow: (file) => file.startsWith('app/frontend/src/lib/desktop') || file.startsWith('app/frontend/src/lib/dash/api'),
  },
]

function parseArgs(argv) {
  const options = {
    mode: 'strict',
    root: process.cwd(),
    updateBaseline: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--audit') options.mode = 'audit'
    else if (arg === '--strict') options.mode = 'strict'
    else if (arg === '--update-baseline') options.updateBaseline = true
    else if (arg === '--root') {
      i += 1
      options.root = path.resolve(argv[i])
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function toPosix(file) {
  return file.split(path.sep).join('/')
}

function listFiles(root) {
  const results = []

  function walk(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      const rel = toPosix(path.relative(root, full))
      if (rel.includes('/node_modules/') || rel.includes('/dist/') || rel.includes('/wailsjs/')) continue
      const info = statSync(full)
      if (info.isDirectory()) walk(full)
      else if (TEXT_EXTENSIONS.has(path.extname(entry))) results.push(full)
    }
  }

  for (const scanDir of DEFAULT_SCAN_DIRS) walk(path.join(root, scanDir))
  return results
}

function lineNumber(source, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1
  }
  return line
}

function findViolations(root) {
  const violations = []
  for (const file of listFiles(root)) {
    const rel = toPosix(path.relative(root, file))
    const source = readFileSync(file, 'utf8')
    for (const rule of rules) {
      if (rule.allow(rel)) continue
      rule.pattern.lastIndex = 0
      for (const match of source.matchAll(rule.pattern)) {
        const line = lineNumber(source, match.index ?? 0)
        const value = match[0]
        violations.push({
          id: `${rule.name}|${rel}|${line}|${value}`,
          rule: rule.name,
          path: rel,
          line,
          match: value,
          message: rule.message,
        })
      }
    }
  }
  return violations.sort((a, b) => a.id.localeCompare(b.id))
}

function loadBaseline(root) {
  const file = path.join(root, BASELINE_PATH)
  if (!existsSync(file)) return new Set()
  const data = JSON.parse(readFileSync(file, 'utf8'))
  return new Set((data.violations ?? []).map((violation) => violation.id))
}

function printViolations(violations) {
  for (const violation of violations) {
    console.log(`${violation.rule}: ${violation.path}:${violation.line}`)
    console.log(`  ${violation.message}`)
    console.log(`  match: ${violation.match}`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const violations = findViolations(options.root)

  if (options.updateBaseline) {
    const baseline = {
      version: 1,
      generatedAt: new Date().toISOString(),
      violations,
    }
    const file = path.join(options.root, BASELINE_PATH)
    writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`Updated ${BASELINE_PATH} with ${violations.length} violations.`)
    return
  }

  const activeViolations =
    options.mode === 'strict'
      ? violations.filter((violation) => !loadBaseline(options.root).has(violation.id))
      : violations

  if (activeViolations.length > 0) {
    printViolations(activeViolations)
    console.error(`Frontend quality gate failed: ${activeViolations.length} violation(s).`)
    process.exit(1)
  }

  console.log(`Frontend quality gate passed in ${options.mode} mode.`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
```

- [ ] **Step 2: Run scanner tests**

Run:

```powershell
node --test scripts/check-frontend-quality.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run audit on the repo**

Run:

```powershell
node scripts/check-frontend-quality.mjs --audit
```

Expected: either PASS if no current violations exist, or FAIL with a readable list of current violations.

- [ ] **Step 4: Commit**

Run:

```powershell
git add scripts/check-frontend-quality.mjs scripts/check-frontend-quality.test.mjs
git commit -m "feat: add frontend quality guardrail scanner"
```

Expected: commit succeeds.

---

### Task 4: Baseline Existing Violations

**Files:**
- Create: `scripts/frontend-quality-baseline.json`

- [ ] **Step 1: Generate baseline**

Run:

```powershell
node scripts/check-frontend-quality.mjs --update-baseline
```

Expected: `scripts/frontend-quality-baseline.json` is created. The command prints the number of current violations.

- [ ] **Step 2: Verify strict mode passes with baseline**

Run:

```powershell
node scripts/check-frontend-quality.mjs --strict
```

Expected: PASS. Existing violations are accepted only because they are in the baseline.

- [ ] **Step 3: Inspect baseline before commit**

Run:

```powershell
Get-Content -Raw -LiteralPath scripts\frontend-quality-baseline.json
```

Expected: JSON contains stable violation ids, paths, rules, lines, matches, and messages. Remove entries only by fixing the underlying code, not by hand-editing ids.

- [ ] **Step 4: Commit**

Run:

```powershell
git add scripts/frontend-quality-baseline.json
git commit -m "chore: baseline frontend quality violations"
```

Expected: commit succeeds.

---

### Task 5: Package Scripts and CI Gate

**Files:**
- Modify: `package.json`
- Modify: `app/frontend/package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add root package scripts**

Modify the root `package.json` scripts block to include:

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "format": "turbo format",
    "check:frontend-quality": "node scripts/check-frontend-quality.mjs --strict",
    "audit:frontend-quality": "node scripts/check-frontend-quality.mjs --audit"
  }
}
```

- [ ] **Step 2: Add desktop package quality script**

Modify `app/frontend/package.json` scripts to include:

```json
{
  "scripts": {
    "quality": "pnpm type-check && pnpm test && node ../../scripts/check-frontend-quality.mjs --strict"
  }
}
```

Keep all existing scripts intact.

- [ ] **Step 3: Add CI quality step**

In `.github/workflows/ci.yml`, add this after `Build shared packages` and before type-check/build steps:

```yaml
      - name: Frontend quality gate
        run: pnpm check:frontend-quality
```

- [ ] **Step 4: Run local verification**

Run:

```powershell
pnpm check:frontend-quality
node --test scripts/check-frontend-quality.test.mjs
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop test
```

Expected: all commands pass. If `pnpm --filter @sprint/desktop test` fails because existing source-assertion tests need updating, inspect the failure and either fix the changed source or update the assertion if the markup change is intentional.

- [ ] **Step 5: Commit**

Run:

```powershell
git add package.json app/frontend/package.json .github/workflows/ci.yml
git commit -m "ci: enforce frontend quality gate"
```

Expected: commit succeeds.

---

### Task 6: Visual Verification Gate Plan

**Files:**
- Create: `docs/FRONTEND_VISUAL_VERIFICATION.md`
- Modify: `docs/FRONTEND_QUALITY.md`

This task documents the visual gate before adding Playwright dependencies. It prevents agents from claiming UI success with no screenshot proof while keeping the first implementation small.

- [ ] **Step 1: Create visual verification doc**

Create `docs/FRONTEND_VISUAL_VERIFICATION.md`:

```markdown
# Frontend Visual Verification

Use this when frontend work changes layout, visual hierarchy, interaction flow,
empty/error/loading states, or any reusable UI primitive.

## Required Screenshots

- Desktop viewport: 1440 x 900.
- Narrow viewport: 390 x 844.
- For dashboard canvas or preview work: prove the canvas is nonblank and framed.
- For data-driven Wails screens: use `wails dev` or a deliberate `window.go` mock.

## Review Checklist

- No overlapping text or controls.
- Primary action is clear and singular per region.
- Loading, empty, error, disabled, selected, hover, and focus states are visible
  where the workflow needs them.
- Icon-only controls have names or visible labels nearby.
- Keyboard path is predictable.
- Numbers and tabular data align.
- No local visual language appears beside shared Sprint primitives.
- Existing actions from the pre-change screen are still reachable.

## Evidence In Final Response

Agents must report:

- URLs or commands used.
- Screenshot paths.
- Viewports checked.
- Any screen that could not be verified and why.
```

- [ ] **Step 2: Link visual verification from quality contract**

Add this paragraph to `docs/FRONTEND_QUALITY.md` under `Required Verification`:

```markdown
For screenshot requirements and review criteria, follow
`docs/FRONTEND_VISUAL_VERIFICATION.md`.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs/FRONTEND_QUALITY.md docs/FRONTEND_VISUAL_VERIFICATION.md
git commit -m "docs: define frontend visual verification"
```

Expected: commit succeeds.

---

### Task 7: First Debt Reduction Pass

**Files:**
- Modify files reported by `node scripts/check-frontend-quality.mjs --audit`
- Modify: `scripts/frontend-quality-baseline.json`

- [ ] **Step 1: List current violations**

Run:

```powershell
node scripts/check-frontend-quality.mjs --audit
```

Expected: command lists all current violations.

- [ ] **Step 2: Fix low-risk violations first**

Fix violations in this order:

1. New `lucide-react` runtime imports in source.
2. Retired Graphite values outside docs/tests.
3. Raw hex in app or shared UI source that maps directly to an existing token.
4. Clickable divs that can become buttons without layout changes.
5. Blur/gradient surfaces outside brand assets.

- [ ] **Step 3: Regenerate baseline after fixes**

Run:

```powershell
node scripts/check-frontend-quality.mjs --update-baseline
pnpm check:frontend-quality
```

Expected: strict mode passes and baseline count is lower than before.

- [ ] **Step 4: Run focused frontend verification**

Run:

```powershell
pnpm --filter @sprint/ui type-check
pnpm --filter @sprint/ui test
pnpm --filter @sprint/desktop type-check
pnpm --filter @sprint/desktop test
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add scripts/frontend-quality-baseline.json app/frontend packages/ui packages/tokens
git commit -m "fix: reduce frontend quality gate debt"
```

Expected: commit succeeds.

---

### Task 8: Follow-Up Playwright Gate

**Files:**
- Modify: `app/frontend/package.json`
- Create: `app/frontend/playwright.config.ts`
- Create: `app/frontend/e2e/frontend-smoke.spec.ts`
- Modify: `docs/FRONTEND_VISUAL_VERIFICATION.md`

Do this after Tasks 1-7 are merged. The static gate will already block many agent errors; Playwright adds visual proof and workflow smoke checks.

- [ ] **Step 1: Add Playwright dependency**

Run:

```powershell
pnpm --filter @sprint/desktop add -D @playwright/test
```

Expected: `app/frontend/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Add Playwright config**

Create `app/frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../output/playwright',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'narrow',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
})
```

- [ ] **Step 3: Add first smoke test**

Create `app/frontend/e2e/frontend-smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('app shell renders without an empty body', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
  await expect(page.locator('body')).not.toBeEmpty()
  await page.screenshot({ path: `../../output/playwright/app-shell-${test.info().project.name}.png`, fullPage: true })
})
```

- [ ] **Step 4: Add package script**

Modify `app/frontend/package.json` scripts:

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 5: Run Playwright smoke**

Run:

```powershell
pnpm --filter @sprint/desktop test:e2e
```

Expected: PASS and screenshots are written under `output/playwright`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add app/frontend/package.json app/frontend/playwright.config.ts app/frontend/e2e/frontend-smoke.spec.ts pnpm-lock.yaml docs/FRONTEND_VISUAL_VERIFICATION.md
git commit -m "test: add frontend visual smoke gate"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers frontend correctness, UX quality, design drift, visual verification, baseline introduction, scripts, CI, and debt reduction.
- Placeholder scan: No placeholder sections are left for implementers. Playwright is a named follow-up task with exact files and commands.
- Type consistency: Script names, package scripts, and baseline paths are consistent across tasks: `scripts/check-frontend-quality.mjs`, `scripts/frontend-quality-baseline.json`, `pnpm check:frontend-quality`.
- Scope check: The plan is one cohesive subsystem: frontend agent quality gates. Playwright is separated as Task 8 so the first merge remains small and testable.
