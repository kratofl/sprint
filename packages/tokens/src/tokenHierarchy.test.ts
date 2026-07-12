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

test('primitive tokens expose exact Dash Studio anchors', () => {
  assert.equal(primitive.color.orange[500], '#FF6A00')
  assert.equal(primitive.color.green[500], '#16B566')
  assert.equal(primitive.color.red[500], '#F02744')
  assert.equal(primitive.color.yellow[500], '#E0A30C')
  assert.equal(primitive.color.blue[500], '#1F7FE6')
  assert.equal(primitive.color.purple[500], '#A06BFF')
  assert.equal(primitive.color.neutral[900], '#141416')
  assert.equal(primitive.color.neutral[925], '#101012')
  assert.equal(primitive.color.neutral[950], '#0B0B0D')
  assert.equal(primitive.radius.panel, '12px')
  assert.equal(primitive.radius.card, '10px')
  assert.equal(primitive.radius.alert, '10px')
  assert.equal(primitive.radius.control, '7px')
  assert.equal(primitive.radius.icon, '7px')
  assert.equal(primitive.radius.badge, '4px')
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
    bg: '#0B0B0D',
    panel: '#101012',
    panel2: '#141416',
    panel3: '#1B1B1E',
    line: 'rgba(255,255,255,.07)',
    line2: 'rgba(255,255,255,.12)',
    text: '#F5F5F7',
    text2: '#A1A1AA',
    text3: '#6F6F78',
    accent: '#FF6A00',
  })

  assert.deepEqual(publicTokens.graphiteTokens.status, {
    green: '#16B566',
    red: '#F02744',
    yellow: '#E0A30C',
    blue: '#1F7FE6',
    purple: '#A06BFF',
  })

  assert.deepEqual(publicTokens.graphiteTokens.radius, {
    radius: '10px',
    r: '10px',
    xs: '4px',
    sm: '7px',
    md: '7px',
    lg: '10px',
    xl: '12px',
    panel: '12px',
    card: '10px',
    alert: '10px',
    control: '7px',
    tile: '10px',
    icon: '7px',
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
  assert.equal(cssVar('--bg'), '#0B0B0D')
  assert.equal(cssVar('--panel'), '#101012')
  assert.equal(cssVar('--panel2'), '#141416')
  assert.equal(cssVar('--panel3'), '#1B1B1E')
  assert.equal(cssVar('--line'), 'rgba(255, 255, 255, .07)')
  assert.equal(cssVar('--line2'), 'rgba(255, 255, 255, .12)')
  assert.equal(cssVar('--text'), '#F5F5F7')
  assert.equal(cssVar('--text2'), '#A1A1AA')
  assert.equal(cssVar('--text3'), '#6F6F78')
  assert.equal(cssVar('--accent'), '#FF6A00')
  assert.equal(cssVar('--green'), '#16B566')
  assert.equal(cssVar('--red'), '#F02744')
  assert.equal(cssVar('--yellow'), '#E0A30C')
  assert.equal(cssVar('--blue'), '#1F7FE6')
  assert.equal(cssVar('--purple'), '#A06BFF')

  assert.equal(cssVar('--radius'), '10px')
  assert.equal(cssVar('--r'), 'var(--radius)')
  assert.equal(cssVar('--radius-panel'), 'var(--primitive-radius-panel)')
  assert.equal(cssVar('--primitive-radius-card'), '10px')
  assert.equal(cssVar('--radius-alert'), 'var(--primitive-radius-alert)')
  assert.equal(cssVar('--radius-control'), 'var(--primitive-radius-control)')
  assert.equal(cssVar('--radius-tile'), 'var(--primitive-radius-tile)')
  assert.equal(cssVar('--radius-badge'), 'var(--primitive-radius-badge)')
  assert.equal(cssVar('--radius-pill'), 'var(--primitive-radius-pill)')

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
  assert.equal(cssVar('--component-shell-titlebar-border'), 'var(--line2)')
  assert.equal(cssVar('--component-shell-command-button-hover-bg'), 'var(--panel3)')
  assert.equal(cssVar('--component-shell-command-button-pressed-bg'), 'var(--panel)')
  assert.equal(cssVar('--component-shell-nav-border'), 'var(--line2)')
  assert.equal(cssVar('--component-shell-nav-item-hover-bg'), 'var(--panel3)')
  assert.equal(cssVar('--component-shell-page-header-bg'), 'var(--panel2)')
  assert.equal(cssVar('--component-shell-page-header-border'), 'var(--line2)')
  assert.equal(cssVar('--component-nav-rail-bg'), 'var(--bg)')

  assert.equal(cssVar('--component-dash-editor-well'), 'var(--bg)')
  assert.equal(cssVar('--component-dash-editor-well-top'), 'var(--bg)')
  assert.equal(cssVar('--component-dash-editor-rail'), 'var(--panel)')
  assert.equal(cssVar('--component-dash-editor-rail-head'), 'var(--panel2)')
  assert.equal(cssVar('--component-dash-editor-inset'), 'var(--bg)')
  assert.equal(cssVar('--component-dash-editor-seam'), 'var(--bg)')

  assert.equal(publicTokens.componentTokens.shell.titleBar.border, publicTokens.graphiteTokens.color.line2)
  assert.equal(publicTokens.componentTokens.shell.commandButton.bgHover, publicTokens.graphiteTokens.color.panel3)
  assert.equal(publicTokens.componentTokens.shell.commandButton.bgPressed, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.componentTokens.shell.nav.border, publicTokens.graphiteTokens.color.line2)
  assert.equal(publicTokens.componentTokens.shell.nav.itemBgHover, publicTokens.graphiteTokens.color.panel3)
  assert.equal(publicTokens.componentTokens.shell.pageHeader.bg, publicTokens.graphiteTokens.color.panel2)
  assert.equal(publicTokens.componentTokens.shell.pageHeader.border, publicTokens.graphiteTokens.color.line2)
  assert.equal(publicTokens.componentTokens.nav.railBg, publicTokens.graphiteTokens.color.bg)
  assert.equal(publicTokens.componentTokens.dashEditor.well, publicTokens.graphiteTokens.color.bg)
  assert.equal(publicTokens.componentTokens.dashEditor.wellTop, publicTokens.graphiteTokens.color.bg)
  assert.equal(publicTokens.componentTokens.dashEditor.rail, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.componentTokens.dashEditor.railHead, publicTokens.graphiteTokens.color.panel2)
  assert.equal(publicTokens.componentTokens.dashEditor.inset, publicTokens.graphiteTokens.color.bg)
  assert.equal(publicTokens.componentTokens.dashEditor.seam, publicTokens.graphiteTokens.color.bg)
})

test('global semantic platform CSS variables align with semantic token source', () => {
  assert.equal(publicTokens.semanticTokens.color.platform.winui.controlHover, publicTokens.graphiteTokens.color.panel3)
  assert.equal(publicTokens.semanticTokens.color.platform.winui.controlPressed, publicTokens.graphiteTokens.color.panel)
  assert.equal(cssVar('--semantic-color-platform-winui-control-hover'), 'var(--panel3)')
  assert.equal(cssVar('--semantic-color-platform-winui-control-pressed'), 'var(--panel)')
})

test('compatibility gradient exports are flat Graphite fills', () => {
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
  assert.equal(publicTokens.gradientAccentSubtle, 'rgba(255,106,0,.13)')
  assert.equal(publicTokens.gradientTeal, publicTokens.graphiteTokens.color.panel)
  assert.equal(publicTokens.gradientTealSubtle, publicTokens.graphiteTokens.color.panel2)
  assert.equal(button.defaultBackground, publicTokens.gradientAccent)
  assert.equal(button.secondaryBackground, publicTokens.gradientTeal)
})

test('secondary compatibility aliases map to the Dash Studio blue info channel', () => {
  const colors = tokensConfig.theme?.extend?.colors as Record<string, unknown>
  assert.deepEqual(colors.secondary, { DEFAULT: 'var(--blue)', foreground: '#ffffff' })
  assert.match(globalsSource, /--secondary:\s*var\(--blue\);/)
  assert.match(globalsSource, /--secondary-dark:\s*var\(--blue-ring\);/)
  assert.match(globalsSource, /--secondary-muted:\s*var\(--blue-soft\);/)
  assert.match(globalsSource, /--secondary-surface:\s*var\(--blue-tint\);/)
})

test('component tokens match Dash Studio nav, action, and input parity', () => {
  const colors = tokensConfig.theme?.extend?.colors as Record<string, any>

  assert.equal(publicTokens.component.shell.nav.itemBgActive, '#1B1B1E')
  assert.equal(publicTokens.component.nav.itemBgActive, '#1B1B1E')
  assert.equal(colors.component.shell.nav.itemBgActive, '#1B1B1E')
  assert.equal(colors.component.nav.active, '#1B1B1E')
  assert.match(globalsSource, /--component-shell-nav-item-active-bg:\s*var\(--panel-3\);/)

  assert.equal(publicTokens.semantic.color.action.primaryMuted, 'rgba(255,106,0,.13)')
  assert.match(globalsSource, /--semantic-color-action-primary-muted:\s*rgba\(255,\s*106,\s*0,\s*\.13\);/)
  assert.match(globalsSource, /--semantic-color-platform-winui-accent-muted:\s*rgba\(255,\s*106,\s*0,\s*\.14\);/)
  assert.match(globalsSource, /--accent-muted:\s*var\(--orange-soft\);/)
  assert.match(globalsSource, /--orange-tint:\s*rgba\(255,\s*106,\s*0,\s*\.13\);/)

  assert.equal(publicTokens.component.input.bg, '#141416')
  assert.equal(publicTokens.component.input.border, 'rgba(255,255,255,.07)')
  assert.equal(publicTokens.component.input.radius, '7px')
  assert.equal(publicTokens.component.input.height, '32px')
  assert.equal(colors.component.input.bg, '#141416')
  assert.equal(colors.component.input.border, 'rgba(255,255,255,.07)')
  assert.match(globalsSource, /--component-input-bg:\s*var\(--panel2\);/)
  assert.match(globalsSource, /--component-input-border:\s*var\(--line\);/)
  assert.match(globalsSource, /--component-input-radius:\s*var\(--primitive-radius-control\);/)
  assert.match(globalsSource, /--component-input-height:\s*32px;/)
})

test('semantic tokens describe product meaning instead of raw palette groups', () => {
  assert.match(semanticSource, /action:\s*\{[\s\S]*primary:\s*primitiveColor\.orange\[500\]/)
  assert.match(semanticSource, /status:\s*\{[\s\S]*success:\s*primitiveColor\.green\[500\]/)
  assert.match(semanticSource, /danger:\s*primitiveColor\.red\[500\]/)
  assert.match(semanticSource, /panel:\s*primitiveColor\.neutral\[925\]/)
  assert.match(semanticSource, /platform:\s*\{[\s\S]*winui:\s*\{[\s\S]*mica:\s*primitiveColor\.neutral\[925\]/)
})

test('component tokens compose semantic tokens for reusable UI parts', () => {
  assert.match(componentSource, /button:\s*\{[\s\S]*primary:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.action\.primary/)
  assert.match(componentSource, /card:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.surface\.panel/)
  assert.match(componentSource, /input:\s*\{[\s\S]*borderFocus:\s*semanticTokens\.color\.border\.focus/)
  assert.match(componentSource, /dashEditor:\s*\{[\s\S]*rail:\s*semanticTokens\.color\.surface\.panel/)
  assert.match(componentSource, /shell:\s*\{[\s\S]*titleBar:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.platform\.winui\.mica/)
})
