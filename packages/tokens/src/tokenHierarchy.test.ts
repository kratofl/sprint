import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import tokensConfig from '../tailwind.config.ts'
import * as publicTokens from './index.ts'
import { primitive } from './primitive/index.ts'

const colorSteps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const semanticSource = readFileSync(new URL('./semantic/index.ts', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('./component/index.ts', import.meta.url), 'utf8')
const globalsSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8')

test('primitive color groups expose Figma-style 50-950 ramps', () => {
  for (const group of ['orange', 'green', 'red', 'yellow', 'blue', 'purple', 'neutral'] as const) {
    for (const step of colorSteps) {
      assert.ok(step in primitive.color[group])
    }
  }
})

test('primitive tokens expose exact Figma anchors', () => {
  assert.equal(primitive.color.orange[500], '#ff6a00')
  assert.equal(primitive.color.green[500], '#16b566')
  assert.equal(primitive.color.red[500], '#f02744')
  assert.equal(primitive.color.yellow[500], '#e0a30c')
  assert.equal(primitive.color.blue[500], '#1f7fe6')
  assert.equal(primitive.color.neutral[950], '#0a0a0a')
  assert.equal(primitive.radius.panel, '14px')
  assert.equal(primitive.radius.alert, '10px')
  assert.equal(primitive.radius.control, '8px')
  assert.equal(primitive.radius.tile, '6px')
  assert.equal(primitive.radius.badge, '4px')
})

test('public token entrypoint exports Figma token layers', () => {
  assert.equal(publicTokens.primitive.color.orange[500], '#ff6a00')
  assert.equal(publicTokens.semantic.color.status.info, '#1f7fe6')
  assert.equal(publicTokens.component.button.primary.bg, '#ff6a00')
  assert.equal(publicTokens.semanticTokens.color.status.info, '#1f7fe6')
  assert.equal(publicTokens.componentTokens.button.primary.bg, '#ff6a00')
})

test('secondary compatibility aliases map to the Figma blue info channel', () => {
  const colors = tokensConfig.theme?.extend?.colors as Record<string, unknown>
  assert.deepEqual(colors.secondary, { DEFAULT: 'var(--blue)', foreground: '#ffffff' })
  assert.match(globalsSource, /--secondary:\s*var\(--blue\);/)
  assert.match(globalsSource, /--secondary-dark:\s*var\(--blue-ring\);/)
  assert.match(globalsSource, /--secondary-muted:\s*rgba\(31,\s*127,\s*230,\s*\.12\);/)
  assert.match(globalsSource, /--secondary-surface:\s*var\(--blue-tint\);/)
})

test('component tokens match Figma nav, action, and input parity', () => {
  const colors = tokensConfig.theme?.extend?.colors as Record<string, any>

  assert.equal(publicTokens.component.shell.nav.itemBgActive, '#1a1a1a')
  assert.equal(publicTokens.component.nav.itemBgActive, '#1a1a1a')
  assert.equal(colors.component.shell.nav.itemBgActive, '#1a1a1a')
  assert.equal(colors.component.nav.active, '#1a1a1a')
  assert.match(globalsSource, /--component-shell-nav-item-active-bg:\s*var\(--panel-3\);/)

  assert.equal(publicTokens.semantic.color.action.primaryMuted, 'rgba(255,106,0,.13)')
  assert.match(globalsSource, /--semantic-color-action-primary-muted:\s*rgba\(255,\s*106,\s*0,\s*\.13\);/)
  assert.match(globalsSource, /--semantic-color-platform-winui-accent-muted:\s*rgba\(255,\s*106,\s*0,\s*\.14\);/)
  assert.match(globalsSource, /--accent-muted:\s*var\(--orange-soft\);/)
  assert.match(globalsSource, /--orange-tint:\s*#33170a;/)

  assert.equal(publicTokens.component.input.bg, '#141414')
  assert.equal(publicTokens.component.input.border, '#2e2e2e')
  assert.equal(publicTokens.component.input.radius, '8px')
  assert.equal(publicTokens.component.input.height, '32px')
  assert.equal(colors.component.input.bg, '#141414')
  assert.equal(colors.component.input.border, '#2e2e2e')
  assert.match(globalsSource, /--component-input-bg:\s*var\(--panel-2\);/)
  assert.match(globalsSource, /--component-input-border:\s*var\(--border\);/)
  assert.match(globalsSource, /--component-input-radius:\s*var\(--primitive-radius-control\);/)
  assert.match(globalsSource, /--component-input-height:\s*32px;/)
})

test('semantic tokens describe product meaning instead of raw palette groups', () => {
  assert.match(semanticSource, /action:\s*\{[\s\S]*primary:\s*primitiveColor\.orange\[500\]/)
  assert.match(semanticSource, /status:\s*\{[\s\S]*success:\s*primitiveColor\.green\[500\]/)
  assert.match(semanticSource, /danger:\s*primitiveColor\.red\[500\]/)
  assert.match(semanticSource, /panel:\s*primitiveColor\.neutral\[850\]/)
  assert.match(semanticSource, /platform:\s*\{[\s\S]*winui:\s*\{[\s\S]*mica:\s*primitiveColor\.neutral\[850\]/)
})

test('component tokens compose semantic tokens for reusable UI parts', () => {
  assert.match(componentSource, /button:\s*\{[\s\S]*primary:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.action\.primary/)
  assert.match(componentSource, /card:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.surface\.panel/)
  assert.match(componentSource, /input:\s*\{[\s\S]*borderFocus:\s*semanticTokens\.color\.border\.focus/)
  assert.match(componentSource, /dashEditor:\s*\{[\s\S]*rail:\s*semanticTokens\.color\.surface\.panel/)
  assert.match(componentSource, /shell:\s*\{[\s\S]*titleBar:\s*\{[\s\S]*bg:\s*semanticTokens\.color\.platform\.winui\.mica/)
})
