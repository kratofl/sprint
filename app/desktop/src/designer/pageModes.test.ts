import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout, DashPage } from '@sprint/dashboard'
import { cycledPages, newModeId, setEverySession, setPageJump, toggleShowIn } from './pageModes'

const page = (id: string, showIn?: string[]): DashPage => ({ id, name: id, widgets: [], ...(showIn ? { showIn } : {}) })
const dash: DashLayout = { id: 'd', name: 'Dash', mode: 'basic', gridCols: 20, gridRows: 12, alerts: [], pages: [page('push', ['qualifying']), page('any')] }
const pageOf = (layout: DashLayout | null, id: string): DashPage | undefined => layout?.pages.find((item) => item.id === id)

test('turning "every session" off picks every session; taking the last pick away turns it back on', () => {
  const off = setEverySession(dash, 'any', false)
  assert.deepEqual(pageOf(off, 'any')?.showIn, ['practice', 'qualifying', 'race'])
  assert.equal(setEverySession(dash, 'any', true), null, 'already on')

  const onlyQuali = toggleShowIn(dash, 'push', 'fuel-save')
  assert.deepEqual(pageOf(onlyQuali, 'push')?.showIn, ['qualifying', 'fuel-save'])
  const cleared = toggleShowIn(toggleShowIn(onlyQuali ?? dash, 'push', 'fuel-save') ?? dash, 'push', 'qualifying')
  assert.equal(pageOf(cleared, 'push')?.showIn, undefined)
})

test('a jump is set and cleared without leaving an empty field behind', () => {
  const flying = setPageJump(dash, 'push', 'flyingLap')
  assert.equal(pageOf(flying, 'push')?.jump, 'flyingLap')
  assert.equal(setPageJump(flying ?? dash, 'push', 'flyingLap'), null)
  assert.equal('jump' in (pageOf(setPageJump(flying ?? dash, 'push', null), 'push') ?? {}), false)
})

test('the dock preview: sessions include pages on every session, a mode only its own, and never none', () => {
  const pages = [page('any'), page('push', ['qualifying']), page('energy', ['fuel-save'])]
  const ids = (preview: string, from = pages) => [...cycledPages(from, preview)]
  assert.deepEqual(ids('race'), ['any'])
  assert.deepEqual(ids('qualifying'), ['any', 'push'])
  assert.deepEqual(ids('fuel-save'), ['energy'])
  assert.deepEqual(ids('all'), ['any', 'push', 'energy'])
  // Nothing in it: the wheel falls back, so nothing is struck through.
  assert.deepEqual(ids('wet'), ['any', 'push', 'energy'])
  assert.deepEqual(ids('race', [page('push', ['qualifying'])]), ['push'])
})

test('a new mode id comes from its name and never takes a session id or an existing one', () => {
  assert.equal(newModeId('Fuel save!', []), 'fuel-save')
  assert.equal(newModeId('Fuel save', [{ id: 'fuel-save', name: 'Other' }]), 'fuel-save-2')
  assert.equal(newModeId('Race', []), 'mode')
  assert.equal(newModeId('🌧', []), 'mode')
})
