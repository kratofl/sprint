import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Device, DeviceDashRule } from '../views/DevicesDomain'
import { carClassOf, isPointable, ownDash, placeName, placesOf, pointScope, scopeOf, shownDash, type DashScope } from './dashScope'

const device = (id: string, dashId: string, dashRules: DeviceDashRule[] = []): Device => ({
  id, name: id === 'omega' ? 'Omega PRO V2' : 'NX50', presetId: '', driver: '', type: 'screen', vid: 0, pid: 0, width: 800, height: 480,
  rotation: 0, offsetX: 0, offsetY: 0, margin: 0, dashId, dashRules, purpose: 'dash', refreshHz: 30, disabled: false, captureRegion: null, bindings: [], transparent: false,
})

const omega = device('omega', 'race', [{ kind: 'class', value: 'Hypercar', dashId: 'hyper' }])
const nx = device('nx', 'race')
const devices = [omega, nx]
const all: DeviceDashRule[] = [{ kind: 'class', value: 'LMP2', dashId: 'lmp2' }, { kind: 'class', value: 'Hypercar', dashId: 'all-hyper' }]
const exists = () => true
const scope = (overrides: Partial<DashScope>): DashScope => ({ device: 'omega', game: null, carClass: null, car: null, ...overrides })

test('a scope shows its own dash, else the most specific broader one, a device’s own before every device’s', () => {
  assert.deepEqual(shownDash(scope({}), devices, all, exists), { dashId: 'race', from: { device: 'omega', rule: null } })
  assert.equal(shownDash(scope({ carClass: 'Hypercar' }), devices, all, exists)?.dashId, 'hyper', 'the device’s own class beats every device’s')
  assert.equal(shownDash(scope({ device: 'nx', carClass: 'Hypercar' }), devices, all, exists)?.dashId, 'all-hyper')
  assert.deepEqual(shownDash(scope({ carClass: 'LMP2', car: 'LMP2 ELMS' }), devices, all, exists), { dashId: 'lmp2', from: { device: null, rule: { kind: 'class', value: 'LMP2' } } }, 'a car falls back to its class')
  assert.equal(shownDash(scope({ device: null, game: 'LeMansUltimate' }), devices, all, exists), null, 'nothing for every device: each shows its own')
  assert.equal(shownDash(scope({ carClass: 'Hypercar' }), devices, all, (id) => id !== 'hyper')?.dashId, 'all-hyper', 'a deleted dash is passed over')
})

test('only a scope’s own rule is its own dash; “All devices” has none without a game, class or car', () => {
  assert.equal(ownDash(scope({}), devices, all), 'race')
  assert.equal(ownDash(scope({ carClass: 'hypercar' }), devices, all), 'hyper')
  assert.equal(ownDash(scope({ carClass: 'LMP2' }), devices, all), null)
  assert.equal(ownDash(scope({ device: null, carClass: 'LMP2' }), devices, all), 'lmp2')
  assert.equal(isPointable(scope({ device: null })), false)
  assert.equal(pointScope(scope({ device: null }), 'race', devices, all), null)
})

test('pointing a scope at a dash sets the device’s own dash, or adds or changes exactly its rule', () => {
  assert.deepEqual(pointScope(scope({}), 'quali', devices, all), { type: 'devices.update', deviceId: 'omega', name: 'Omega PRO V2', rotation: 0, offsetX: 0, offsetY: 0, margin: 0, dashId: 'quali' })
  assert.deepEqual(pointScope(scope({ carClass: 'Hypercar' }), 'quali', devices, all)?.rules, [{ kind: 'class', value: 'Hypercar', dashId: 'quali' }])
  assert.deepEqual(pointScope(scope({ carClass: 'LMP2', car: 'LMP2 ELMS' }), 'elms', devices, all)?.rules, [
    { kind: 'class', value: 'Hypercar', dashId: 'hyper' },
    { kind: 'car', value: 'LMP2 ELMS', dashId: 'elms' },
  ])
  assert.deepEqual(pointScope(scope({ device: null, game: 'LeMansUltimate' }), 'lmu', devices, all), {
    type: 'dash.allDevicesRules',
    rules: [...all, { kind: 'game', value: 'LeMansUltimate', dashId: 'lmu' }],
  })
})

test('a dash lists every place it is used, and each place opens as the scope it stands for', () => {
  const places = placesOf('race', devices, [{ kind: 'car', value: 'Hypercar BMW', dashId: 'race' }])
  assert.deepEqual(places.map((place) => placeName(place, devices)), ['Omega PRO V2 · every car', 'NX50 · every car', 'All devices › Hypercar BMW'])
  assert.deepEqual(scopeOf(places[2]), { device: null, game: null, carClass: 'Hypercar', car: 'Hypercar BMW' })
  assert.equal(carClassOf('LMGT3 Porsche'), 'LMGT3')
  assert.equal(carClassOf('Porsche 963'), null)
})
