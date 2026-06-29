import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buttonPrimaryClassName,
  buttonDestructiveClassName,
  buttonSuccessClassName,
  buttonErrorClassName,
  cardElevatedClassName,
  cardDestructiveClassName,
} from './controlClasses.ts'

const buttonSource = readFileSync(new URL('./Button.tsx', import.meta.url), 'utf8')
const badgeSource = readFileSync(new URL('./Badge.tsx', import.meta.url), 'utf8')
const inputSource = readFileSync(new URL('./input.tsx', import.meta.url), 'utf8')
const selectSource = readFileSync(new URL('./select.tsx', import.meta.url), 'utf8')
const segmentedSource = readFileSync(new URL('./SegmentedControl.tsx', import.meta.url), 'utf8')
const switchSource = readFileSync(new URL('./switch.tsx', import.meta.url), 'utf8')

test('primary button gets the Figma orange accent surface', () => {
  const className = buttonPrimaryClassName

  // Figma Primary: bg Orange/500, text Neutral/900 (--panel = #141414).
  assert.match(className, /bg-\[var\(--accent\)\]/)
  assert.match(className, /border-\[var\(--accent\)\]/)
  assert.match(className, /text-\[var\(--panel\)\]/)
  assert.match(buttonSource, /normal-case/)
  assert.match(buttonSource, /tracking-\[0\]/)
  assert.match(buttonSource, /font-medium/)
  assert.doesNotMatch(className, /uppercase/)
  assert.doesNotMatch(buttonSource, /uppercase/)
  assert.doesNotMatch(className, /tracking-\[0\.1em\]/)
  assert.doesNotMatch(buttonSource, /tracking-\[0\.1em\]/)
})

test('destructive button uses Figma tile bg with red text', () => {
  const className = buttonDestructiveClassName

  // Figma Destructive: bg Neutral/800 (--panel2), 1px Neutral/700 border, text Red/500.
  assert.match(className, /bg-\[var\(--panel2\)\]/)
  assert.match(className, /border-\[var\(--line\)\]/)
  assert.match(className, /text-\[var\(--red\)\]/)
})

test('success and error message buttons use solid status fills', () => {
  // Figma Primary_Success (#16B566) and Primary_Error (#F02744).
  assert.match(buttonSuccessClassName, /bg-\[var\(--green\)\]/)
  assert.match(buttonSuccessClassName, /text-\[var\(--panel\)\]/)
  assert.match(buttonErrorClassName, /bg-\[var\(--red\)\]/)
  assert.match(buttonErrorClassName, /text-\[var\(--panel\)\]/)
  assert.match(buttonSource, /success: buttonSuccessClassName/)
  assert.match(buttonSource, /error: buttonErrorClassName/)
})

test('elevated and destructive card variants use explicit flat token chrome', () => {
  assert.match(cardElevatedClassName, /bg-\[var\(--panel\)\]/)
  assert.match(cardElevatedClassName, /border-\[var\(--line\)\]/)
  assert.match(cardDestructiveClassName, /bg-\[var\(--red-soft\)\]/)
  assert.match(cardDestructiveClassName, /border-\[var\(--red\)\]/)
})

test('button sizes follow Figma component metrics', () => {
  assert.match(buttonSource, /\bbtn\b/)
  // Default: h28, radius 18, Inter Medium 13, gap 4 (icon↔label).
  assert.match(buttonSource, /default:\s*"h-\[28px\][^"]*rounded-\[18px\][^"]*px-4[^"]*size-\[13px\]/)
  assert.match(buttonSource, /xs:\s*"h-\[24px\][^"]*rounded-\[18px\][^"]*text-\[11px\][^"]*size-3/)
  assert.match(buttonSource, /sm:\s*"h-\[26px\][^"]*rounded-\[18px\][^"]*text-\[12px\]/)
  assert.match(buttonSource, /lg:\s*"h-\[32px\][^"]*rounded-\[18px\][^"]*text-\[14px\]/)
  // Icon size: 32×32 circle (radius pill).
  assert.match(buttonSource, /icon:\s*"size-\[32px\][^"]*rounded-\[999px\]/)
  assert.match(buttonSource, /"icon-xs":\s*"size-6[^"]*rounded-\[999px\]/)
  assert.match(buttonSource, /"icon-sm":\s*"size-\[28px\][^"]*rounded-\[999px\]/)
  assert.match(buttonSource, /"icon-lg":\s*"size-\[40px\][^"]*rounded-\[999px\]/)
  // Figma icon-button inner stroke: primary Orange/400, secondary Neutral/700.
  assert.match(buttonSource, /border-\[var\(--primitive-color-orange-400\)\]/)
  assert.match(buttonSource, /link:\s*"border-transparent text-\[var\(--text2\)\] underline-offset-4 hover:text-\[var\(--accent\)\] hover:underline"/)
})

test('badges expose Figma chip chrome', () => {
  assert.match(badgeSource, /\btag\b/)
  assert.doesNotMatch(badgeSource, /\bds-/, 'shared Badge must not depend on app-local ds-* classes')
  // Figma chip: Saira Semi Condensed Bold 12, uppercase, radius xxs (4), 1px border.
  assert.match(badgeSource, /text-\[12px\]/)
  assert.match(badgeSource, /font-saira-sc/)
  assert.match(badgeSource, /font-bold/)
  assert.match(badgeSource, /uppercase/)
  assert.match(badgeSource, /rounded-\[4px\]/)
  assert.match(badgeSource, /bg-transparent/)
  // New Figma color prop (red/green/blue/orange/neutral).
  assert.match(badgeSource, /color: \{/)
  assert.match(badgeSource, /red:/)
  assert.match(badgeSource, /green:/)
  assert.match(badgeSource, /blue:/)
  assert.match(badgeSource, /orange:/)
})

test('form controls use Figma input field chrome', () => {
  assert.match(inputSource, /h-\[32px\]/)
  assert.match(inputSource, /rounded-\[18px\]/)
  assert.match(inputSource, /border-\[var\(--line\)\]/)
  assert.match(inputSource, /bg-\[var\(--panel2\)\]/)
  assert.match(inputSource, /focus:border-\[var\(--accent\)\]/)
  assert.match(inputSource, /tracking-\[0\]/)
  assert.match(inputSource, /font-normal/)
  // Error state → border Red/500.
  assert.match(inputSource, /data-\[error=true\]:border-\[var\(--red\)\]/)
  assert.doesNotMatch(inputSource, /\bfocus:ring-1\b|\bfocus-visible:ring-1\b|\bfocus-visible:ring-\[3px\]\b/)

  assert.match(selectSource, /data-\[size=default\]:h-\[34px\]/)
  // Wave 4: control-role radius is xl (18), not the legacy --r calc; focus uses
  // the shared accent border idiom.
  assert.match(selectSource, /rounded-xl/)
  assert.doesNotMatch(selectSource, /rounded-\[calc\(var\(--r\)-2px\)\]/)
  assert.match(selectSource, /border-\[var\(--line\)\]/)
  assert.match(selectSource, /bg-\[var\(--panel2\)\]/)
  assert.match(selectSource, /focus-visible:border-\[var\(--accent\)\]/)
  assert.doesNotMatch(selectSource, /\baria-invalid:ring-2\b/)
})

test('segmented control uses exact Figma tone-based selected contracts', () => {
  // Figma segmented control: container Neutral/800, segments pad 6×18, radius
  // pill, Inter Medium 13. Active accent = Orange/500 / Neutral/900; light =
  // Neutral/50 / Neutral/900 (page-tab style).
  assert.match(segmentedSource, /rounded-pill/)
  assert.match(segmentedSource, /px-\[18px\]/)
  assert.match(segmentedSource, /py-1\.5/)
  assert.match(segmentedSource, /font-medium/)
  // Active fill is a single sliding indicator (the "drop"); text stays per-segment.
  assert.match(segmentedSource, /data-slot="segment-indicator"/)
  assert.match(segmentedSource, /data-\[tone=accent\]:bg-\[var\(--accent\)\]/)
  assert.match(segmentedSource, /data-\[tone=accent\]:data-\[selected=true\]:text-\[var\(--panel\)\]/)
  assert.match(segmentedSource, /data-\[tone=light\]:bg-\[var\(--primitive-color-neutral-50\)\]/)
  assert.match(segmentedSource, /data-\[tone=light\]:data-\[selected=true\]:text-\[var\(--panel\)\]/)
  // Spring slide with reduced-motion respected.
  assert.match(segmentedSource, /ease-\[var\(--ease-spring\)\]/)
  assert.match(segmentedSource, /motion-reduce:transition-none/)
})

test('switch knob uses exact Figma toggle metrics without shadow', () => {
  // Figma "Toggle": track 57×33 pad 4, knob 25; On = Green/500, Off = Neutral/800,
  // knob Neutral/50, disabled knob Neutral/600, disabled-on track Green/800.
  assert.match(switchSource, /data-\[size=default\]:w-\[57px\]/)
  assert.match(switchSource, /data-\[size=sm\]:w-\[46px\]/)
  assert.match(switchSource, /focus-visible:border-\[var\(--accent\)\]/)
  assert.match(switchSource, /data-\[state=checked\]:bg-\[var\(--green\)\]/)
  assert.match(switchSource, /data-\[state=unchecked\]:bg-\[var\(--panel2\)\]/)
  assert.match(switchSource, /data-\[state=checked\]:data-\[disabled\]:bg-\[var\(--primitive-color-green-800\)\]/)
  assert.match(switchSource, /bg-\[var\(--primitive-color-neutral-50\)\]/)
  assert.match(switchSource, /group-data-\[disabled\]\/switch:bg-\[var\(--primitive-color-neutral-600\)\]/)
  assert.doesNotMatch(switchSource, /shadow-sm/)
  assert.match(switchSource, /data-\[state=checked\]:translate-x-\[24px\]/)
  assert.match(switchSource, /data-\[state=unchecked\]:translate-x-0/)
  assert.match(switchSource, /group-data-\[size=default\]\/switch:size-\[25px\]/)
  assert.match(switchSource, /group-data-\[size=sm\]\/switch:size-\[18px\]/)
  assert.match(switchSource, /group-data-\[size=sm\]\/switch:data-\[state=checked\]:translate-x-\[20px\]/)
})
