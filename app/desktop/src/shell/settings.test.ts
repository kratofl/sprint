import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readDriverName, readSidebarCollapsed, readWebAppUrl } from './settings'

test('readSidebarCollapsed reads the boolean field and defaults to false', () => {
  assert.equal(readSidebarCollapsed({ sidebarCollapsed: true }), true)
  assert.equal(readSidebarCollapsed({ sidebarCollapsed: false }), false)
  assert.equal(readSidebarCollapsed({}), false)
  assert.equal(readSidebarCollapsed({ sidebarCollapsed: 'true' }), false)
})

test('readWebAppUrl reads settings.cloud.webAppUrl and trims it', () => {
  assert.equal(readWebAppUrl({ cloud: { webAppUrl: ' http://localhost:3000 ' } }), 'http://localhost:3000')
  assert.equal(readWebAppUrl({ cloud: { webAppUrl: '' } }), null)
  assert.equal(readWebAppUrl({ cloud: {} }), null)
  assert.equal(readWebAppUrl({}), null)
})

test('readDriverName trims the name and treats blank as unset', () => {
  assert.equal(readDriverName({ driverName: ' Alex ' }), 'Alex')
  assert.equal(readDriverName({ driverName: '   ' }), null)
  assert.equal(readDriverName({}), null)
})
