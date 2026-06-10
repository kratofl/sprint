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
const inputSource = readFileSync(new URL('./input.tsx', import.meta.url), 'utf8')
const selectSource = readFileSync(new URL('./select.tsx', import.meta.url), 'utf8')

test('primary button gets a solid orange surface', () => {
  const className = buttonPrimaryClassName

  assert.match(className, /bg-\[var\(--orange\)\]/)
  assert.match(className, /border-\[var\(--orange\)\]/)
  assert.match(className, /text-\[#141414\]/)
})

test('destructive button uses Figma red badge tint and ring', () => {
  const className = buttonDestructiveClassName

  assert.match(className, /bg-\[var\(--red-tint\)\]/)
  assert.match(className, /border-\[var\(--red-ring\)\]/)
  assert.match(className, /text-\[var\(--red\)\]/)
})

test('elevated and destructive card variants use explicit flat token chrome', () => {
  assert.match(cardElevatedClassName, /bg-\[var\(--panel\)\]/)
  assert.match(cardElevatedClassName, /border-\[var\(--border\)\]/)
  assert.match(cardDestructiveClassName, /bg-\[var\(--red-tint\)\]/)
  assert.match(cardDestructiveClassName, /border-\[var\(--red-ring\)\]/)
})

test('button sizes follow Figma component metrics', () => {
  assert.match(buttonSource, /default:\s*"h-\[25px\][^"]*px-\[14px\][^"]*py-\[6px\][^"]*text-\[13px\]/)
  assert.match(buttonSource, /sm:\s*"h-\[21px\][^"]*px-\[10px\][^"]*py-\[4px\][^"]*text-\[12px\]/)
  assert.match(buttonSource, /icon:\s*"size-\[25px\][^"]*rounded-tile[^"]*p-\[6px\][^"]*size-\[13px\]/)
  assert.match(buttonSource, /"icon-lg":\s*"size-\[28px\][^"]*size-4/)
})

test('form controls use Figma 32px field chrome', () => {
  assert.match(inputSource, /\bh-8\b/)
  assert.match(inputSource, /\brounded-control\b/)
  assert.match(inputSource, /border-\[var\(--border\)\]/)
  assert.match(inputSource, /bg-\[var\(--panel-2\)\]/)
  assert.match(inputSource, /\bfocus:border-primary\b/)
  assert.doesNotMatch(inputSource, /\bfocus:ring-1\b|\bfocus-visible:ring-1\b|\bfocus-visible:ring-\[3px\]\b/)

  assert.match(selectSource, /data-\[size=default\]:h-8/)
  assert.match(selectSource, /\brounded-control\b/)
  assert.match(selectSource, /border-\[var\(--border\)\]/)
  assert.match(selectSource, /bg-\[var\(--panel-2\)\]/)
  assert.match(selectSource, /\bfocus-visible:border-primary\b/)
  assert.doesNotMatch(selectSource, /\baria-invalid:ring-2\b/)
})
