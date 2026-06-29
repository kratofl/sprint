#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
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
    allow: (file) =>
      file.startsWith('docs/') ||
      file.endsWith('.test.ts') ||
      file.endsWith('.test.tsx') ||
      file.endsWith('.test.mjs') ||
      file.startsWith('app/frontend/src/components/widgetPreview/'),
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
    changedOnly: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--audit') options.mode = 'audit'
    else if (arg === '--strict') options.mode = 'strict'
    else if (arg === '--update-baseline') options.updateBaseline = true
    else if (arg === '--changed-only') options.changedOnly = true
    else if (arg === '--root') {
      i += 1
      if (!argv[i]) throw new Error('--root requires a path')
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

function isIgnored(rel) {
  return rel.includes('/node_modules/') || rel.includes('/dist/') || rel.includes('/wailsjs/')
}

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(path.extname(file))
}

function isDefaultScanPath(rel) {
  return DEFAULT_SCAN_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}/`))
}

function listFiles(root) {
  const results = []

  function walk(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      const rel = toPosix(path.relative(root, full))
      if (isIgnored(rel)) continue
      const info = statSync(full)
      if (info.isDirectory()) walk(full)
      else if (isTextFile(entry)) results.push(full)
    }
  }

  for (const scanDir of DEFAULT_SCAN_DIRS) walk(path.join(root, scanDir))
  return results
}

function listChangedFiles(root) {
  let output = ''
  try {
    output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD', '--'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return listFiles(root)
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((rel) => isDefaultScanPath(rel) && !isIgnored(rel) && isTextFile(rel))
    .map((rel) => path.join(root, rel))
    .filter((file) => existsSync(file) && statSync(file).isFile())
}

function lineNumber(source, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1
  }
  return line
}

function withoutComments(source) {
  let output = ''
  let state = 'code'

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (state === 'line-comment') {
      if (char === '\n') {
        state = 'code'
        output += char
      } else {
        output += ' '
      }
      continue
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  '
        i += 1
        state = 'code'
      } else {
        output += char === '\n' ? '\n' : ' '
      }
      continue
    }

    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      output += char
      if (char === '\\') {
        i += 1
        output += source[i] ?? ''
        continue
      }
      if (state === 'single-quote' && char === "'") state = 'code'
      else if (state === 'double-quote' && char === '"') state = 'code'
      else if (state === 'template' && char === '`') state = 'code'
      continue
    }

    if (char === '/' && next === '/') {
      output += '  '
      i += 1
      state = 'line-comment'
    } else if (char === '/' && next === '*') {
      output += '  '
      i += 1
      state = 'block-comment'
    } else {
      output += char
      if (char === "'") state = 'single-quote'
      else if (char === '"') state = 'double-quote'
      else if (char === '`') state = 'template'
    }
  }

  return output
}

function findViolations(root, options = {}) {
  const files = options.changedOnly ? listChangedFiles(root) : listFiles(root)
  const violations = []
  for (const file of files) {
    const rel = toPosix(path.relative(root, file))
    const source = withoutComments(readFileSync(file, 'utf8'))
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
  const violations = findViolations(options.root, options)

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
