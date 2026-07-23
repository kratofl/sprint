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
  assert.match(tabsTriggerBaseClassName, /\bui-control\b/)
  assert.match(tabsTriggerActiveClassName, /group-data-\[variant=top\]\/tabs-list:data-\[state=active\]:border-\[var\(--accent\)\]/)
})

test('segmented tab variants expose Figma item metrics and active state', () => {
  assert.match(tabsListVariantClassNames.default, /rounded-control/)
  assert.match(tabsListVariantClassNames.default, /gap-\[2px\]/)
  assert.match(tabsListVariantClassNames.default, /p-1/)
  assert.match(tabsTriggerBaseClassName, /h-\[25px\]/)
  assert.match(tabsTriggerBaseClassName, /rounded-tile/)
  assert.match(tabsTriggerBaseClassName, /px-\[14px\]/)
  assert.match(tabsTriggerBaseClassName, /py-\[6px\]/)
  assert.match(tabsTriggerBaseClassName, /font-wordmark/)
  assert.match(tabsTriggerActiveClassName, /data-\[state=active\]:bg-\[var\(--accent\)\]/)
  assert.match(tabsTriggerActiveClassName, /data-\[state=active\]:text-\[var\(--panel2\)\]/)
  assert.match(tabsTriggerActiveClassName, /data-\[state=active\]:border-\[var\(--accent\)\]/)
  assert.doesNotMatch(tabsTriggerActiveClassName, /border-border-strong/)
})
