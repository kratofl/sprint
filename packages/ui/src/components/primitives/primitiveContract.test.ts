import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import * as primitives from './index.ts'
import * as root from '../../index.ts'

const contractExports = [
  'IconButton',
  'SegmentedControl',
  'Stepper',
  'Tile',
  'SettingsCard',
  'SettingsRow',
  'KeyChip',
  'StatusPill',
  'Modal',
  'ConfirmDialog',
] as const

const primitiveFiles = [
  'IconButton.tsx',
  'SegmentedControl.tsx',
  'Stepper.tsx',
  'Tile.tsx',
  'SettingsCard.tsx',
  'SettingsRow.tsx',
  'KeyChip.tsx',
  'StatusPill.tsx',
  'Modal.tsx',
  'ConfirmDialog.tsx',
] as const

function sourceFor(fileName: string) {
  const fileUrl = new URL(`./${fileName}`, import.meta.url)
  return existsSync(fileUrl) ? readFileSync(fileUrl, 'utf8') : ''
}

test('exports the shared primitive contract from primitives and package root', () => {
  for (const exportName of contractExports) {
    assert.equal(typeof primitives[exportName], 'function', `${exportName} is exported from components/primitives`)
    assert.equal(typeof root[exportName], 'function', `${exportName} is exported from @sprint/ui`)
  }
})

test('icon-only controls require an accessible label and visible token focus chrome', () => {
  const source = sourceFor('IconButton.tsx')

  assert.match(source, /label:\s*string/, 'IconButton exposes a required label prop')
  assert.match(source, /Omit<ButtonProps,\s*"children"\s*\|\s*"size"\s*\|\s*"aria-label"\s*\|\s*"icon"\s*>/, 'IconButtonProps omits aria-label so callers cannot override the accessible name')
  assert.match(source, /aria-label=\{label\}/, 'IconButton maps label to aria-label')
  assert.match(source, /\{\.\.\.props\}[\s\S]*aria-label=\{label\}/, 'IconButton applies component-owned aria-label after props')
  assert.match(source, /focus-visible:border-\[var\(--accent\)\]/)
  assert.doesNotMatch(source, /gradient|glass|backdrop-blur|shadow-\[|orb/i)
})

test('controls match the Apple Graphite reference scale and natural text casing', () => {
  const buttonSource = sourceFor('Button.tsx')
  const controlClassSource = sourceFor('controlClasses.ts')
  const inputSource = sourceFor('input.tsx')
  const switchSource = sourceFor('switch.tsx')
  const segmentedSource = sourceFor('SegmentedControl.tsx')

  assert.match(buttonSource, /normal-case/)
  assert.match(buttonSource, /tracking-\[0\]/)
  assert.match(buttonSource, /font-medium/)
  assert.match(buttonSource, /link:\s*"border-transparent text-\[var\(--text2\)\] underline-offset-4 hover:text-\[var\(--accent\)\] hover:underline"/)
  assert.doesNotMatch(buttonSource, /uppercase/)
  assert.doesNotMatch(controlClassSource, /uppercase/)
  // Figma Primary: bg Orange/500, text Neutral/900 (--panel). Secondary: tile bg, default text.
  assert.match(controlClassSource, /bg-\[var\(--accent\)\] text-\[var\(--panel\)\]/)
  assert.match(controlClassSource, /bg-\[var\(--panel2\)\] text-\[var\(--text\)\]/)
  assert.match(inputSource, /rounded-\[18px\]/)
  assert.match(inputSource, /font-normal/)
  assert.match(inputSource, /focus:border-\[var\(--accent\)\]/)
  assert.match(switchSource, /data-\[size=default\]:h-\[33px\]/)
  assert.match(switchSource, /data-\[size=default\]:w-\[57px\]/)
  assert.match(switchSource, /data-\[size=sm\]:w-\[46px\]/)
  assert.match(switchSource, /data-\[state=checked\]:bg-\[var\(--green\)\]/)
  assert.match(switchSource, /data-\[state=unchecked\]:bg-\[var\(--panel2\)\]/)
  assert.match(switchSource, /focus-visible:border-\[var\(--accent\)\]/)
  assert.match(switchSource, /bg-\[var\(--primitive-color-neutral-50\)\]/)
  assert.match(switchSource, /data-\[state=checked\]:translate-x-\[24px\]/)
  assert.match(switchSource, /data-\[state=unchecked\]:translate-x-0/)
  assert.match(switchSource, /group-data-\[size=default\]\/switch:size-\[25px\]/)
  assert.match(switchSource, /group-data-\[size=sm\]\/switch:size-\[18px\]/)
  assert.match(switchSource, /group-data-\[size=sm\]\/switch:data-\[state=checked\]:translate-x-\[20px\]/)
  assert.doesNotMatch(switchSource, /focus-visible:ring-ring/)
  assert.doesNotMatch(switchSource, /shadow-sm/)
  assert.match(segmentedSource, /variant\?:\s*SegmentedControlVariant/)
  assert.match(segmentedSource, /tone\?:\s*SegmentedControlTone/)
  assert.match(segmentedSource, /data-tone=\{resolvedTone\}/)
  assert.match(segmentedSource, /px-\[18px\]/)
  assert.match(segmentedSource, /font-medium/)
  assert.match(segmentedSource, /data-\[tone=accent\]:/)
  assert.match(segmentedSource, /data-slot="segment-indicator"/)
  assert.match(segmentedSource, /data-\[tone=accent\]:bg-\[var\(--accent\)\]/)
  assert.match(segmentedSource, /data-\[tone=accent\]:data-\[selected=true\]:text-\[var\(--panel\)\]/)
  assert.match(segmentedSource, /data-\[tone=light\]:/)
})

test('segmented control has grouped token styling and accessible selection state', () => {
  const source = sourceFor('SegmentedControl.tsx')

  assert.match(source, /label:\s*string/, 'SegmentedControl requires an accessible group name')
  assert.match(source, /Omit<React\.ComponentProps<"div">,\s*"onChange"\s*\|\s*"aria-label"\s*>/, 'SegmentedControlProps omits aria-label so callers cannot override the group name')
  assert.match(source, /\{\.\.\.props\}[\s\S]*aria-label=\{label\}/, 'SegmentedControl applies component-owned aria-label after props')
  assert.match(source, /role="radiogroup"/)
  assert.match(source, /aria-label=\{label\}/)
  assert.match(source, /role="radio"/)
  assert.match(source, /aria-checked=\{option\.value === value\}/)
  assert.match(source, /tabIndex=\{option\.value === focusValue \? 0 : -1\}/, 'SegmentedControl uses roving tabIndex for custom radio buttons')
  assert.match(source, /onKeyDown=\{handleKeyDown\}/, 'SegmentedControl handles radio keyboard selection')
  assert.match(source, /focusValue/, 'SegmentedControl keeps a focusable enabled option when value is missing')
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
    assert.match(source, new RegExp(`"${key}"`), `SegmentedControl handles ${key}`)
  }
  assert.match(source, /\.focus\(\)/, 'SegmentedControl focuses the selected button after keyboard selection')
  // Figma container = Neutral/800 pill (no border). Selected fill is a single
  // sliding indicator pill (the "drop"), tone-based.
  assert.match(source, /bg-\[var\(--panel2\)\]/)
  assert.match(source, /rounded-pill/)
  assert.match(source, /data-slot="segment-indicator"/)
  assert.match(source, /data-\[tone=accent\]:bg-\[var\(--accent\)\]/)
  assert.match(source, /focus-visible:border-\[var\(--accent\)\]/)
  assert.doesNotMatch(source, /gradient|glass|backdrop-blur|shadow-\[|orb/i)
})

test('stepper exposes labeled decrement and increment controls plus a numeric input', () => {
  const source = sourceFor('Stepper.tsx')

  assert.match(source, /decrementLabel\??:\s*string/)
  assert.match(source, /incrementLabel\??:\s*string/)
  assert.match(source, /useState/, 'Stepper keeps an editable string draft')
  assert.match(source, /draftValue/, 'Stepper input is controlled by draft text, not the committed number')
  assert.match(source, /type="number"/)
  assert.match(source, /value=\{draftValue\}/)
  assert.match(source, /onBlur=\{commitDraftValue\}/)
  assert.match(source, /event\.key === "Enter"/)
  assert.match(source, /draftValue\.trim\(\) === ""/, 'Stepper treats an empty draft as invalid instead of committing zero')
  assert.match(source, /aria-label=\{decrementLabel\}/)
  assert.match(source, /aria-label=\{incrementLabel\}/)
  assert.match(source, /focus-visible:border-\[var\(--accent\)\]/)
  assert.doesNotMatch(source, /value=\{value\}/, 'Stepper must not snap editable input directly back to the committed value')
  assert.doesNotMatch(source, /valueAsNumber/, 'Stepper must not ignore NaN during normal empty or partial numeric editing')
  assert.doesNotMatch(source, /gradient|glass|backdrop-blur|shadow-\[|orb/i)
})

test('surface primitives use Graphite tokens without local ds class dependencies', () => {
  for (const fileName of ['Tile.tsx', 'SettingsCard.tsx', 'SettingsRow.tsx', 'KeyChip.tsx', 'StatusPill.tsx']) {
    const source = sourceFor(fileName)

    assert.match(source, /var\(--panel\)|var\(--panel2\)/, `${fileName} uses panel tokens`)
    assert.match(source, /var\(--line\)/, `${fileName} uses line tokens`)
    assert.match(source, /var\(--text2\)|var\(--muted\)/, `${fileName} uses secondary text tokens`)
    assert.doesNotMatch(source, /\bds-/, `${fileName} does not depend on local ds-* classes`)
    assert.doesNotMatch(source, /gradient|glass|backdrop-blur|shadow-\[|orb/i)
  }

  assert.match(sourceFor('StatusPill.tsx'), /var\(--green\)|var\(--yellow\)|var\(--red\)|var\(--blue\)/)
})

test('modal composes shared Dialog primitives instead of a separate overlay system', () => {
  const source = sourceFor('Modal.tsx')

  assert.match(source, /from "\.\/dialog"/)
  assert.match(source, /DialogContent/)
  assert.match(source, /DialogTitle/)
  assert.match(source, /DialogDescription/)
  assert.doesNotMatch(source, /DialogPrimitive|Overlay|Portal|fixed inset-0/)
})

test('confirm dialog composes shared dialog and button primitives', () => {
  const source = sourceFor('ConfirmDialog.tsx')

  assert.match(source, /from "\.\/Button"/)
  assert.match(source, /from "\.\/dialog"/)
  assert.match(source, /onCancel:\s*\(\)\s*=>\s*void/)
  assert.match(source, /onConfirm:\s*\(\)\s*=>\s*void/)
  assert.match(source, /showCloseButton=\{false\}/)
  assert.match(source, /variant === "destructive" \? "destructive" : "primary"/)
  assert.doesNotMatch(source, /DialogPrimitive|Overlay|Portal|fixed inset-0/)
  assert.doesNotMatch(source, /\bds-/)
})

test('new primitive sources avoid gradients, glass styles, and ds class dependencies', () => {
  for (const fileName of primitiveFiles) {
    const source = sourceFor(fileName)

    assert.doesNotMatch(source, /gradient|glass|backdrop-blur|shadow-\[|orb/i, `${fileName} avoids decorative effects`)
    assert.doesNotMatch(source, /\bds-/, `${fileName} avoids ds-* dependencies`)
  }
})
