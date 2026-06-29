import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import tokensConfig from '../tailwind.config.ts'
import * as publicTokens from './index.ts'
import { button } from './organisms/button.ts'
import { primitive } from './primitive/index.ts'

const colorSteps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const semanticSource = readFileSync(new URL('./semantic/index.ts', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('./component/index.ts', import.meta.url), 'utf8')
const globalsSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8')

const cssVar = (name: string) => {
  const match = globalsSource.match(new RegExp(`${name}:\\s*([^;]+);`))
  assert.ok(match, `Missing CSS variable ${name}`)
  return match[1].trim()
}

test('primitive color groups expose Figma-style 50-950 ramps', () => {
  for (const group of ['orange', 'green', 'red', 'yellow', 'blue', 'purple', 'neutral'] as const) {
    for (const step of colorSteps) {
      assert.ok(step in primitive.color[group])
    }
  }
})

test('primitive tokens expose exact Figma anchors', () => {
  assert.equal(primitive.color.orange[500], '#FF6A00')
  assert.equal(primitive.color.green[500], '#16B566')
  assert.equal(primitive.color.red[500], '#F02744')
  assert.equal(primitive.color.yellow[500], '#E0A30C')
  assert.equal(primitive.color.blue[500], '#1F7FE6')
  assert.equal(primitive.color.purple[500], '#8F76FF')
  assert.equal(primitive.color.neutral[50], '#F6F6F6')
  assert.equal(primitive.color.neutral[900], '#141414')
  assert.equal(primitive.color.neutral[925], '#0F0F0F')
  assert.equal(primitive.color.neutral[990], '#050505')
  assert.equal(primitive.radius.xxs, '4px')
  assert.equal(primitive.radius.xs, '6px')
  assert.equal(primitive.radius.sm, '8px')
  assert.equal(primitive.radius.md, '12px')
  assert.equal(primitive.radius.lg, '16px')
  assert.equal(primitive.radius.xl, '18px')
  assert.equal(primitive.radius.pill, '999px')
  assert.equal(primitive.space[1], '2px')
  assert.equal(primitive.space[7], '16px')
  assert.equal(primitive.space[12], '36px')
})

test('public token entrypoint exports Dash Studio token layers', () => {
  assert.equal(publicTokens.primitive.color.orange[500], '#FF6A00')
  assert.equal(publicTokens.semantic.color.status.info, '#1F7FE6')
  assert.equal(publicTokens.component.button.primary.bg, '#FF6A00')
  assert.equal(publicTokens.semanticTokens.color.status.info, '#1F7FE6')
  assert.equal(publicTokens.componentTokens.button.primary.bg, '#FF6A00')
  assert.equal(publicTokens.figmaTokens.primitive.color.orange[500].$value, '#FF6A00')
  assert.equal(publicTokens.figmaTokens.component.button.primary.bg.$value, '#FF6A00')
})

test('Graphite token source exposes the canonical product contract', () => {
  assert.deepEqual(publicTokens.graphiteTokens.color, {
    bg: '#0F0F0F',
    panel: '#141414',
    panel2: '#1F1F1F',
    panel3: '#2E2E2E',
    line: '#2E2E2E',
    line2: '#424242',
    text: '#F6F6F6',
    text2: '#A0A0A0',
    text3: '#7A7A7A',
    accent: '#FF6A00',
  })

  assert.deepEqual(publicTokens.graphiteTokens.status, {
    green: '#16B566',
    red: '#F02744',
    yellow: '#E0A30C',
    blue: '#1F7FE6',
    purple: '#8F76FF',
  })

  assert.deepEqual(publicTokens.graphiteTokens.radius, {
    radius: '18px',
    r: '18px',
    panel: '18px',
    alert: '12px',
    control: '18px',
    tile: '12px',
    badge: '4px',
    pill: '999px',
  })

  assert.deepEqual(publicTokens.graphiteTokens.motion, {
    instant: '0ms',
    fast: '120ms',
    normal: '160ms',
    slow: '240ms',
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  })
})

test('global CSS exposes Graphite public variables and aliases', () => {
  assert.equal(cssVar('--bg'), 'var(--primitive-color-neutral-925)')
  assert.equal(cssVar('--panel'), 'var(--primitive-color-neutral-900)')
  assert.equal(cssVar('--panel2'), 'var(--primitive-color-neutral-800)')
  assert.equal(cssVar('--panel3'), 'var(--primitive-color-neutral-700)')
  assert.equal(cssVar('--line'), 'var(--primitive-color-neutral-700)')
  assert.equal(cssVar('--line2'), 'var(--primitive-color-neutral-600)')
  assert.equal(cssVar('--text'), 'var(--primitive-color-neutral-50)')
  assert.equal(cssVar('--text2'), 'var(--primitive-color-neutral-300)')
  assert.equal(cssVar('--text3'), 'var(--primitive-color-neutral-400)')
  assert.equal(cssVar('--accent'), 'var(--primitive-color-orange-500)')
  assert.equal(cssVar('--green'), 'var(--primitive-color-green-500)')
  assert.equal(cssVar('--red'), 'var(--primitive-color-red-500)')
  assert.equal(cssVar('--yellow'), 'var(--primitive-color-yellow-500)')
  assert.equal(cssVar('--blue'), 'var(--primitive-color-blue-500)')
  assert.equal(cssVar('--purple'), 'var(--primitive-color-purple-500)')

  // Resolved primitive anchors match the Figma hex.
  assert.equal(cssVar('--primitive-color-neutral-925'), '#0F0F0F')
  assert.equal(cssVar('--primitive-color-neutral-900'), '#141414')
  assert.equal(cssVar('--primitive-color-orange-500'), '#FF6A00')
  assert.equal(cssVar('--primitive-color-red-500'), '#F02744')
  assert.equal(cssVar('--primitive-color-blue-500'), '#1F7FE6')

  assert.equal(cssVar('--radius'), '18px')
  assert.equal(cssVar('--r'), 'var(--radius)')
  assert.equal(cssVar('--radius-panel'), 'var(--primitive-radius-panel)')
  assert.equal(cssVar('--radius-alert'), 'var(--primitive-radius-alert)')
  assert.equal(cssVar('--radius-control'), 'var(--primitive-radius-control)')
  assert.equal(cssVar('--radius-tile'), 'var(--primitive-radius-tile)')
  assert.equal(cssVar('--radius-badge'), 'var(--primitive-radius-badge)')
  assert.equal(cssVar('--radius-pill'), 'var(--primitive-radius-pill)')
  assert.equal(cssVar('--primitive-radius-xl'), '18px')
  assert.equal(cssVar('--primitive-radius-md'), '12px')

  assert.equal(cssVar('--motion-duration-instant'), '0ms')
  assert.equal(cssVar('--motion-duration-fast'), '120ms')
  assert.equal(cssVar('--motion-duration-normal'), '160ms')
  assert.equal(cssVar('--motion-duration-slow'), '240ms')
  assert.equal(cssVar('--motion-ease'), 'cubic-bezier(0.4, 0, 0.2, 1)')
  assert.equal(cssVar('--motion-ease-out'), 'cubic-bezier(0, 0, 0.2, 1)')
  assert.equal(cssVar('--motion-ease-in'), 'cubic-bezier(0.4, 0, 1, 1)')
  assert.equal(cssVar('--duration-fast'), 'var(--motion-duration-fast)')
  assert.equal(cssVar('--duration-normal'), 'var(--motion-duration-normal)')
  assert.equal(cssVar('--duration-slow'), 'var(--motion-duration-slow)')
  assert.equal(cssVar('--ease-standard'), 'var(--motion-ease)')
  assert.equal(cssVar('--ease-out'), 'var(--motion-ease-out)')
  assert.equal(cssVar('--ease-in'), 'var(--motion-ease-in)')
})

test('global CSS exposes the self-hosted Figma font stacks', () => {
  assert.equal(cssVar('--font-display'), "'Space Grotesk', system-ui, sans-serif")
  assert.equal(cssVar('--font-wordmark'), "'Space Grotesk', system-ui, sans-serif")
  assert.equal(cssVar('--font-body'), "'Inter', system-ui, sans-serif")
  assert.equal(cssVar('--font-ui'), "'Inter', system-ui, sans-serif")
  assert.equal(cssVar('--font-numeric'), "'Saira', system-ui, sans-serif")
  assert.equal(cssVar('--font-saira-sc'), "'Saira Semi Condensed', system-ui, sans-serif")
  assert.equal(cssVar('--font-incidental'), "'Sora', system-ui, sans-serif")
  assert.match(globalsSource, /font-family:\s*'Inter', system-ui, sans-serif;\s*\n\s*font-size:\s*13px;/)
  assert.doesNotMatch(globalsSource, /IBM Plex Sans/)
  assert.doesNotMatch(globalsSource, /fonts\.googleapis\.com/)
})

test('global CSS stays limited to token variables and token-backed utilities', () => {
  assert.doesNotMatch(globalsSource, /@layer\s+components\b/)
  assert.doesNotMatch(globalsSource, /\.fd\.tone-slate\b/)
  assert.doesNotMatch(globalsSource, /\.tone-slate\b/)
  assert.doesNotMatch(globalsSource, /\.btn\b/)
  assert.doesNotMatch(globalsSource, /\.icobtn\b/)
  assert.doesNotMatch(globalsSource, /\.ds-page\b/)
})

test('global component CSS variables align with component token source', () => {
  assert.equal(publicTokens.componentTokens.shell.window.border, '#404040')
  assert.equal(cssVar('--component-shell-window-border'), '#404040')
  assert.equal(cssVar('--component-shell-titlebar-border'), 'var(--line)')
  assert.equal(cssVar('--component-shell-command-button-hover-bg'), 'var(--panel3)')
  assert.equal(cssVar('--component-shell-command-button-pressed-bg'), 'var(--primitive-color-neutral-850)')
  assert.equal(cssVar('--component-shell-nav-border'), 'var(--line)')
  assert.equal(cssVar('--component-shell-nav-item-hover-bg'), 'var(--panel3)')
  assert.equal(cssVar('--component-shell-page-header-bg'), 'var(--panel)')
  assert.equal(cssVar('--component-shell-page-header-border'), 'var(--line)')
  assert.equal(cssVar('--component-nav-rail-bg'), 'var(--panel)')

  assert.equal(cssVar('--component-dash-editor-well'), 'var(--bg-deep)')
  assert.equal(cssVar('--component-dash-editor-rail'), 'var(--panel)')
  assert.equal(cssVar('--component-dash-editor-rail-head'), 'var(--panel2)')
  assert.equal(cssVar('--component-dash-editor-inset'), 'var(--bg-deep)')
  assert.equal(cssVar('--component-dash-editor-seam'), 'var(--bg-deep)')

  assert.equal(publicTokens.componentTokens.shell.titleBar.border, publicTokens.graphiteTokens.color.line)
  assert.equal(publicTokens.componentTokens.shell.nav.border, publicTokens.graphiteTokens.color.line)
  assert.equal(publicTokens.componentTokens.shell.pageHeader.bg, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.componentTokens.shell.pageHeader.border, publicTokens.graphiteTokens.color.line)
  assert.equal(publicTokens.componentTokens.nav.railBg, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.componentTokens.dashEditor.well, '#050505') // canvas = Surface/Screen
  assert.equal(publicTokens.componentTokens.dashEditor.rail, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.componentTokens.dashEditor.railHead, publicTokens.graphiteTokens.color.panel2)
})

test('button component tokens match the Figma button recipe', () => {
  assert.equal(publicTokens.componentTokens.button.primary.bg, '#FF6A00')
  assert.equal(publicTokens.componentTokens.button.primary.text, '#141414')
  assert.equal(publicTokens.componentTokens.button.secondary.bg, '#1F1F1F')
  assert.equal(publicTokens.componentTokens.button.secondary.text, '#F6F6F6')
  assert.equal(publicTokens.componentTokens.button.destructive.bg, '#1F1F1F')
  assert.equal(publicTokens.componentTokens.button.destructive.text, '#F02744')
  assert.equal(publicTokens.componentTokens.button.disabled.bg, '#141414')
  assert.equal(publicTokens.componentTokens.button.disabled.text, '#7A7A7A')
  assert.equal(publicTokens.componentTokens.button.radius, '18px')
  assert.equal(publicTokens.componentTokens.button.paddingX, '16px')
  assert.equal(publicTokens.componentTokens.button.paddingY, '6px')
  assert.equal(publicTokens.componentTokens.button.gap, '4px')
})

test('badge component tokens use the family {500 icon / 700 border / 950 bg} trios', () => {
  assert.equal(publicTokens.componentTokens.badge.danger.text, '#F02744')
  assert.equal(publicTokens.componentTokens.badge.danger.border, '#A4172C')
  assert.equal(publicTokens.componentTokens.badge.danger.bg, '#3A0A10')
  assert.equal(publicTokens.componentTokens.badge.success.text, '#16B566')
  assert.equal(publicTokens.componentTokens.badge.success.border, '#0E7445')
  assert.equal(publicTokens.componentTokens.badge.success.bg, '#05281A')
  assert.equal(publicTokens.componentTokens.badge.neutral.text, '#A0A0A0')
  assert.equal(publicTokens.componentTokens.badge.neutral.border, '#2E2E2E')
  assert.equal(publicTokens.componentTokens.badge.neutral.bg, '#141414')
})

test('toast component tokens map to Surface/Tile + Text Default/Muted', () => {
  assert.equal(publicTokens.componentTokens.toast.bg, '#1F1F1F')
  assert.equal(publicTokens.componentTokens.toast.title, '#F6F6F6')
  assert.equal(publicTokens.componentTokens.toast.message, '#A0A0A0')
})

test('compatibility gradient exports are flat Figma fills', () => {
  const compatibilityFills = [
    publicTokens.gradientAccent,
    publicTokens.gradientAccentSubtle,
    publicTokens.gradientTeal,
    publicTokens.gradientTealSubtle,
    button.defaultBackground,
    button.secondaryBackground,
  ]

  for (const fill of compatibilityFills) {
    assert.doesNotMatch(fill, /linear-gradient/i)
  }

  assert.equal(publicTokens.gradientAccent, publicTokens.graphiteTokens.color.accent)
  assert.equal(publicTokens.gradientAccentSubtle, '#FF6A001A')
  assert.equal(publicTokens.gradientTeal, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.gradientTealSubtle, publicTokens.graphiteTokens.color.panel2)
  assert.equal(button.defaultBackground, publicTokens.gradientAccent)
  assert.equal(button.secondaryBackground, publicTokens.gradientTeal)
})

test('secondary compatibility aliases map to the Figma blue info channel', () => {
  const colors = tokensConfig.theme?.extend?.colors as Record<string, unknown>
  assert.deepEqual(colors.secondary, { DEFAULT: 'var(--blue)', foreground: '#ffffff' })
  assert.match(globalsSource, /--secondary:\s*var\(--blue\);/)
  assert.match(globalsSource, /--secondary-dark:\s*var\(--blue-ring\);/)
  assert.match(globalsSource, /--secondary-surface:\s*var\(--blue-tint\);/)
})

test('component tokens match Figma nav, action, and input parity', () => {
  const colors = tokensConfig.theme?.extend?.colors as Record<string, any>

  assert.equal(publicTokens.component.shell.nav.itemBgActive, '#2E2E2E')
  assert.equal(publicTokens.component.nav.itemBgActive, '#2E2E2E')
  assert.equal(colors.component.shell.nav.itemBgActive, '#2E2E2E')
  assert.equal(colors.component.nav.active, '#2E2E2E')
  assert.match(globalsSource, /--component-shell-nav-item-active-bg:\s*var\(--panel3\);/)

  assert.equal(publicTokens.semantic.color.action.primaryMuted, '#FF6A001A')
  assert.match(globalsSource, /--semantic-color-action-primary-muted:\s*#FF6A001A;/)
  assert.match(globalsSource, /--orange-tint:\s*#FF6A001A;/)

  assert.equal(publicTokens.component.input.bg, '#1F1F1F')
  assert.equal(publicTokens.component.input.border, '#2E2E2E')
  assert.equal(publicTokens.component.input.radius, '18px')
  assert.equal(publicTokens.component.input.height, '32px')
  assert.equal(colors.component.input.bg, '#1F1F1F')
  assert.equal(colors.component.input.border, '#2E2E2E')
  assert.match(globalsSource, /--component-input-bg:\s*var\(--panel2\);/)
  assert.match(globalsSource, /--component-input-border:\s*var\(--line\);/)
  assert.match(globalsSource, /--component-input-radius:\s*var\(--primitive-radius-xl\);/)
  assert.match(globalsSource, /--component-input-height:\s*32px;/)
})

test('semantic tokens describe product meaning instead of raw palette groups', () => {
  assert.match(semanticSource, /action:\s*\{[\s\S]*primary:\s*primitiveColor\.orange\[500\]/)
  assert.match(semanticSource, /status:\s*\{[\s\S]*success:\s*primitiveColor\.green\[500\]/)
  assert.match(semanticSource, /danger:\s*primitiveColor\.red\[500\]/)
  assert.match(semanticSource, /panel:\s*primitiveColor\.neutral\[900\]/)
})

test('component tokens compose semantic tokens for reusable UI parts', () => {
  assert.match(componentSource, /button:\s*\{[\s\S]*primary:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.action\.primary/)
  assert.match(componentSource, /card:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.surface\.panel/)
  assert.match(componentSource, /input:\s*\{[\s\S]*borderFocus:\s*semanticTokens\.color\.border\.focus/)
  assert.match(componentSource, /dashEditor:\s*\{[\s\S]*rail:\s*semanticTokens\.color\.surface\.panel/)
})
