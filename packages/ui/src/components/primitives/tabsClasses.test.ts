import test from 'node:test'
import assert from 'node:assert/strict'

import {
  tabsListVariantClassNames,
  tabsRootBaseClassName,
  tabsTriggerActiveClassName,
  tabsTriggerBaseClassName,
} from './tabsClasses.ts'

test('tabs trigger active styles target Radix active state selectors', () => {
  assert.match(tabsTriggerActiveClassName, /data-\[state=active\]:/)
  assert.doesNotMatch(tabsTriggerActiveClassName, /\bdata-active:/)
})

test('tabs root keeps horizontal and vertical orientation contracts', () => {
  assert.match(tabsRootBaseClassName, /data-\[orientation=horizontal\]:flex-col/)
  assert.match(tabsRootBaseClassName, /data-\[orientation=vertical\]:flex-row/)
})

test('top tabs variant uses deep chrome and bottom-divider framing', () => {
  assert.match(tabsListVariantClassNames.top, /\bbg-\[var\(--panel-2\)\]/)
  assert.match(tabsListVariantClassNames.top, /\bborder-b\b/)
  assert.match(tabsTriggerActiveClassName, /group-data-\[variant=top\]\/tabs-list:data-\[state=active\]:border-\[var\(--orange\)\]/)
})

test('default tab view is a Figma pill container with hairline dividers', () => {
  // Figma "Tab View": pill container bg Neutral/800, 1px border Neutral/700,
  // radius xl (18), padding 4; triggers separated by 1px Neutral/700 dividers.
  assert.match(tabsListVariantClassNames.default, /rounded-xl/)
  assert.match(tabsListVariantClassNames.default, /border-\[var\(--line\)\]/)
  assert.match(tabsListVariantClassNames.default, /bg-\[var\(--panel2\)\]/)
  assert.match(tabsListVariantClassNames.default, /p-1/)
  assert.match(tabsListVariantClassNames.default, /\[&>\*\+\*\]:border-l/)
  assert.match(tabsListVariantClassNames.default, /\[&>\*\+\*\]:border-\[var\(--line\)\]/)
})

test('segmented tab triggers expose Figma item metrics and accent active state', () => {
  assert.match(tabsTriggerBaseClassName, /h-\[25px\]/)
  assert.match(tabsTriggerBaseClassName, /rounded-pill/)
  assert.match(tabsTriggerBaseClassName, /px-\[14px\]/)
  assert.match(tabsTriggerBaseClassName, /py-\[6px\]/)
  // Inter, title-case (Figma) — not uppercase ui-control / Space Grotesk wordmark.
  assert.match(tabsTriggerBaseClassName, /font-sans/)
  assert.doesNotMatch(tabsTriggerBaseClassName, /\bui-control\b|font-wordmark/)
  // Figma "Tab View" active item is the subtle Surface/Tile-2 selected fill with
  // Orange/500 accent text — NOT the Segmented Control's orange-filled segment.
  assert.match(tabsTriggerActiveClassName, /data-\[state=active\]:bg-\[var\(--panel3\)\]/)
  assert.match(tabsTriggerActiveClassName, /data-\[state=active\]:text-\[var\(--accent\)\]/)
  assert.doesNotMatch(tabsTriggerActiveClassName, /data-\[state=active\]:bg-\[var\(--accent\)\]/)
  assert.doesNotMatch(tabsTriggerActiveClassName, /border-border-strong/)
})
