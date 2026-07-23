import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buttonPrimaryClassName,
  buttonDestructiveClassName,
  cardElevatedClassName,
  cardDestructiveClassName,
} from './controlClasses.ts'

const buttonSource = readFileSync(new URL('./Button.tsx', import.meta.url), 'utf8')
const badgeSource = readFileSync(new URL('./Badge.tsx', import.meta.url), 'utf8')
const inputSource = readFileSync(new URL('./input.tsx', import.meta.url), 'utf8')
const selectSource = readFileSync(new URL('./select.tsx', import.meta.url), 'utf8')
const segmentedSource = readFileSync(new URL('./SegmentedControl.tsx', import.meta.url), 'utf8')
const switchSource = readFileSync(new URL('./switch.tsx', import.meta.url), 'utf8')

test('primary button gets the Apple Graphite accent surface', () => {
  const className = buttonPrimaryClassName

  assert.match(className, /bg-\[var\(--accent\)\]/)
  assert.match(className, /border-\[var\(--accent\)\]/)
  assert.match(className, /text-\[#050505\]/)
  assert.match(buttonSource, /normal-case/)
  assert.match(buttonSource, /tracking-\[0\]/)
  assert.doesNotMatch(className, /uppercase/)
  assert.doesNotMatch(buttonSource, /uppercase/)
  assert.doesNotMatch(className, /tracking-\[0\.1em\]/)
  assert.doesNotMatch(buttonSource, /tracking-\[0\.1em\]/)
})

test('destructive button uses flat red danger treatment', () => {
  const className = buttonDestructiveClassName

  assert.match(className, /bg-\[var\(--red\)\]/)
  assert.match(className, /border-\[var\(--red\)\]/)
  assert.match(className, /text-\[#050505\]/)
})

test('elevated and destructive card variants use explicit flat token chrome', () => {
  assert.match(cardElevatedClassName, /bg-\[var\(--panel\)\]/)
  assert.match(cardElevatedClassName, /border-\[var\(--line\)\]/)
  assert.match(cardDestructiveClassName, /bg-\[var\(--red-soft\)\]/)
  assert.match(cardDestructiveClassName, /border-\[var\(--red\)\]/)
})

test('button sizes follow Apple Graphite component metrics', () => {
  assert.match(buttonSource, /\bbtn\b/)
  assert.match(buttonSource, /default:\s*"h-\[36px\][^"]*rounded-\[999px\][^"]*px-5[^"]*has-data-\[icon=inline-end\]:pr-4[^"]*has-data-\[icon=inline-start\]:pl-4[^"]*size-\[15px\]/)
  assert.match(buttonSource, /xs:\s*"h-\[24px\][^"]*rounded-\[999px\][^"]*px-2[^"]*text-\[11px\][^"]*has-data-\[icon=inline-end\]:pr-1\.5[^"]*has-data-\[icon=inline-start\]:pl-1\.5[^"]*size-3/)
  assert.match(buttonSource, /sm:\s*"h-\[30px\][^"]*rounded-\[999px\][^"]*px-3[^"]*text-\[12px\][^"]*has-data-\[icon=inline-end\]:pr-2[^"]*has-data-\[icon=inline-start\]:pl-2[^"]*size-\[14px\]/)
  assert.match(buttonSource, /lg:\s*"h-\[40px\][^"]*rounded-\[999px\][^"]*px-6[^"]*text-\[14px\][^"]*has-data-\[icon=inline-end\]:pr-5[^"]*has-data-\[icon=inline-start\]:pl-5[^"]*size-4/)
  assert.match(buttonSource, /icon:\s*"size-\[36px\][^"]*rounded-\[999px\][^"]*size-\[16px\]/)
  assert.match(buttonSource, /"icon-xs":\s*"size-6[^"]*rounded-\[999px\][^"]*size-3/)
  assert.match(buttonSource, /"icon-sm":\s*"size-\[30px\][^"]*rounded-\[999px\][^"]*size-\[14px\]/)
  assert.match(buttonSource, /"icon-lg":\s*"size-\[40px\][^"]*rounded-\[999px\][^"]*size-\[17px\]/)
  assert.match(buttonSource, /link:\s*"border-transparent text-\[var\(--text2\)\] underline-offset-4 hover:text-\[var\(--accent\)\] hover:underline"/)
})

test('badges expose Dash Studio tag and pill chrome', () => {
  assert.match(badgeSource, /\btag\b/)
  assert.doesNotMatch(badgeSource, /\bds-/, 'shared Badge must not depend on app-local ds-* classes')
  assert.match(badgeSource, /text-\[9\.5px\]/)
  assert.match(badgeSource, /tracking-\[0\.14em\]/)
  assert.match(badgeSource, /t-accent/)
  assert.match(badgeSource, /t-green/)
  assert.match(badgeSource, /t-red/)
  assert.match(badgeSource, /t-solid/)
})

test('form controls use Dash Studio inset field chrome', () => {
  assert.match(inputSource, /h-\[36px\]/)
  assert.match(inputSource, /rounded-\[999px\]/)
  assert.match(inputSource, /border-\[var\(--line\)\]/)
  assert.match(inputSource, /bg-\[var\(--panel2\)\]/)
  assert.match(inputSource, /focus:border-\[var\(--accent\)\]/)
  assert.match(inputSource, /tracking-\[0\]/)
  assert.match(inputSource, /font-normal/)
  assert.doesNotMatch(inputSource, /\bfocus:ring-1\b|\bfocus-visible:ring-1\b|\bfocus-visible:ring-\[3px\]\b/)

  assert.match(selectSource, /data-\[size=default\]:h-\[34px\]/)
  assert.match(selectSource, /rounded-\[calc\(var\(--r\)-2px\)\]/)
  assert.match(selectSource, /border-\[var\(--line\)\]/)
  assert.match(selectSource, /bg-\[var\(--panel2\)\]/)
  assert.match(selectSource, /\bfocus-visible:border-primary\b/)
  assert.doesNotMatch(selectSource, /\baria-invalid:ring-2\b/)
})

test('segmented control uses exact Apple Graphite selected contracts', () => {
  assert.match(segmentedSource, /variant = "neutral"/)
  assert.match(segmentedSource, /min-w-\[96px\]/)
  assert.match(segmentedSource, /px-4/)
  assert.match(segmentedSource, /font-semibold/)
  assert.match(segmentedSource, /data-\[variant=accent\]:data-\[selected=true\]:bg-\[var\(--accent\)\]/)
  assert.match(segmentedSource, /data-\[variant=accent\]:data-\[selected=true\]:text-\[#050505\]/)
  assert.match(segmentedSource, /data-\[variant=neutral\]:data-\[selected=true\]:bg-\[var\(--panel3\)\]/)
  assert.match(segmentedSource, /data-\[variant=neutral\]:data-\[selected=true\]:text-\[var\(--text\)\]/)
  assert.doesNotMatch(segmentedSource, /data-\[selected=true\]:bg-\[var\(--panel3\)\] data-\[selected=true\]:text-\[var\(--accent\)\]/)
})

test('switch thumb uses exact Apple Graphite metrics without shadow', () => {
  assert.match(switchSource, /data-\[size=default\]:w-\[52px\]/)
  assert.match(switchSource, /data-\[size=sm\]:w-\[42px\]/)
  assert.match(switchSource, /focus-visible:border-\[var\(--accent\)\]/)
  assert.match(switchSource, /data-\[state=checked\]:bg-\[var\(--green\)\]/)
  assert.match(switchSource, /data-\[state=unchecked\]:bg-\[var\(--panel2\)\]/)
  assert.match(switchSource, /bg-\[#f5f5f5\]/)
  assert.doesNotMatch(switchSource, /shadow-sm/)
  assert.match(switchSource, /data-\[state=checked\]:translate-x-\[24px\]/)
  assert.match(switchSource, /data-\[state=unchecked\]:translate-x-\[2px\]/)
  assert.match(switchSource, /group-data-\[size=default\]\/switch:size-\[26px\]/)
  assert.match(switchSource, /group-data-\[size=sm\]\/switch:size-5/)
  assert.match(switchSource, /group-data-\[size=sm\]\/switch:data-\[state=checked\]:translate-x-\[20px\]/)
})
