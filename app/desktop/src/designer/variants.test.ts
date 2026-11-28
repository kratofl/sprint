import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout, DashPage } from '@sprint/dashboard'
import type { DashScope } from './dashScope'
import { changedScope, dropVariant, editAt, shownLayout, shownVariant } from './variants'

const page = (name: string): DashPage => ({ id: 'p', name, widgets: [] })
const dash: DashLayout = { id: 'd', name: 'Race', mode: 'basic', gridCols: 10, gridRows: 9, alerts: [], pages: [page('Base')] }
const scope = (levels: Partial<DashScope>): DashScope => ({ device: null, game: null, carClass: null, car: null, ...levels })
const rename = (name: string) => (layout: DashLayout): DashLayout => ({ ...layout, pages: [{ ...layout.pages[0], name }] })

const LMU = scope({ game: 'LeMansUltimate' })
const HYPERCAR = scope({ game: 'LeMansUltimate', carClass: 'Hypercar' })
const BMW = scope({ game: 'LeMansUltimate', carClass: 'Hypercar', car: 'Hypercar BMW' })

test('the first change in a scope makes its version; the dash and the other scopes keep theirs', () => {
  const edited = editAt(dash, HYPERCAR, rename('Hypercar'))
  assert.ok(edited)
  assert.equal(edited.pages[0].name, 'Base')
  assert.equal(edited.variants?.length, 1)
  assert.equal(shownLayout(edited, HYPERCAR).pages[0].name, 'Hypercar')
  assert.equal(shownLayout(edited, BMW).pages[0].name, 'Hypercar', 'a narrower scope inherits it')
  assert.equal(shownLayout(edited, LMU).pages[0].name, 'Base')

  const again = editAt(edited, HYPERCAR, rename('Hypercar 2'))
  assert.equal(again?.variants?.length, 1, 'a second change edits the same version')
  assert.equal(again && shownLayout(again, HYPERCAR).pages[0].name, 'Hypercar 2')
})

test('with nothing picked the dash itself changes, and a change to the dash as a whole makes no version', () => {
  assert.equal(editAt(dash, scope({}), rename('All'))?.pages[0].name, 'All')
  assert.equal(editAt(dash, scope({}), rename('All'))?.variants, undefined)

  const renamed = editAt(dash, HYPERCAR, (layout) => ({ ...layout, name: 'Sprint race' }))
  assert.equal(renamed?.name, 'Sprint race')
  assert.equal(renamed?.variants, undefined)
})

test('the most specific version wins, one for a device before one for every device at the same level', () => {
  const both = editAt(editAt(dash, HYPERCAR, rename('Class')) ?? dash, { ...HYPERCAR, device: 'wheel' }, rename('Wheel class')) ?? dash
  assert.equal(shownVariant(both, { ...BMW, device: 'wheel' })?.layout.pages[0].name, 'Wheel class')
  assert.equal(shownVariant(both, { ...BMW, device: 'box' })?.layout.pages[0].name, 'Class')
  assert.equal(shownVariant(both, scope({ carClass: 'Hypercar' })), null, 'a version naming the game needs it picked')
})

test('dropping a version shows what the scope inherits again', () => {
  const edited = editAt(dash, HYPERCAR, rename('Hypercar')) ?? dash
  const dropped = dropVariant(edited, HYPERCAR)
  assert.equal(dropped.variants, undefined)
  assert.equal(shownLayout(dropped, HYPERCAR).pages[0].name, 'Base')
  assert.equal(dropVariant(edited, BMW), edited, 'a scope with no version of its own has nothing to drop')
})

test('an undo names the one scope it changed, so the designer can show it', () => {
  const edited = editAt(dash, HYPERCAR, rename('Hypercar')) ?? dash
  assert.deepEqual(changedScope(edited, dash), HYPERCAR)
  assert.deepEqual(changedScope(dash, editAt(dash, scope({}), rename('All')) ?? dash), scope({}))
  assert.equal(changedScope(dash, dash), null)
})
