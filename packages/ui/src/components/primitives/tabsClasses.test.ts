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

test('top tabs variant uses shell chrome and bottom-divider framing', () => {
  assert.match(tabsListVariantClassNames.top, /\bbg-bg-shell\b/)
  assert.match(tabsListVariantClassNames.top, /\bborder-b\b/)
  assert.match(tabsTriggerBaseClassName, /group-data-\[variant=top\]\/tabs-list:font-mono/)
  assert.match(tabsTriggerActiveClassName, /group-data-\[variant=top\]\/tabs-list:data-\[state=active\]:border-b-accent/)
})

test('compact and vertical variants expose distinct active-state selectors', () => {
  assert.match(tabsTriggerActiveClassName, /group-data-\[variant=compact\]\/tabs-list:data-\[state=active\]:bg-bg-panel/)
  assert.match(tabsTriggerActiveClassName, /group-data-\[variant=vertical\]\/tabs-list:data-\[state=active\]:bg-bg-panel/)
  assert.match(tabsTriggerActiveClassName, /group-data-\[variant=compact\]\/tabs-list:data-\[state=active\]:border-border/)
  assert.doesNotMatch(tabsTriggerActiveClassName, /group-data-\[variant=compact\]\/tabs-list:data-\[state=active\]:border-border-strong/)
})
