import assert from 'node:assert/strict'
import { test } from 'node:test'
import { back, begin, next } from './flow'

const lan = [{ url: 'http://192.168.1.5:8080', version: '0.1.0' }]

test('a first launch starts with the welcome, connecting later goes straight to the server choice', () => {
  assert.equal(begin('first-run').current.step, 'welcome')
  assert.equal(begin('connect').current.step, 'server')
})

test('Sprint on this PC only ends the setup without asking about accounts or storage', () => {
  const flow = next(next(begin('first-run'), { type: 'start' }), { type: 'chooseLocalOnly' })
  assert.deepEqual(flow.current, { step: 'done', server: 'None', storage: 'Local' })
})

test('the official server skips the network scan and asks for the account on its address', () => {
  const flow = next(begin('connect'), { type: 'chooseOfficial', url: 'https://sprint.example' })
  assert.deepEqual(flow.current, { step: 'account', server: 'Official', serverUrl: 'https://sprint.example' })
})

test('a self-hosted server is looked for first and the first one found is filled in', () => {
  const scanning = next(begin('connect'), { type: 'chooseSelfHosted' })
  assert.equal(scanning.current.step, 'discover')
  const found = next(scanning, { type: 'discovered', servers: lan })
  assert.deepEqual(found.current, { step: 'address', found: lan, url: 'http://192.168.1.5:8080' })
})

test('when nothing is found the address keeps what the driver used before, still editable', () => {
  const flow = next(next(begin('connect', 'http://my-server:8080'), { type: 'chooseSelfHosted' }), { type: 'discovered', servers: [] })
  assert.deepEqual(flow.current, { step: 'address', found: [], url: 'http://my-server:8080' })
})

test('after signing in the driver picks storage, and only data worth moving asks about a transfer', () => {
  const signedIn = next(next(begin('connect'), { type: 'chooseOfficial', url: 'https://sprint.example' }), { type: 'signedIn' })
  assert.deepEqual(signedIn.current, { step: 'storage', server: 'Official' })

  const withData = next(signedIn, { type: 'chooseStorage', storage: 'Both', localItems: 12 })
  assert.deepEqual(withData.current, { step: 'transfer', server: 'Official', storage: 'Both' })

  const nothingHere = next(signedIn, { type: 'chooseStorage', storage: 'Both', localItems: 0 })
  assert.deepEqual(nothingHere.current, { step: 'done', server: 'Official', storage: 'Both' })

  const localOnly = next(signedIn, { type: 'chooseStorage', storage: 'Local', localItems: 12 })
  assert.deepEqual(localOnly.current, { step: 'done', server: 'Official', storage: 'Local' })
})

test('back returns to the previous step and remembers which way the panel moved', () => {
  const address = next(next(begin('connect'), { type: 'chooseSelfHosted' }), { type: 'discovered', servers: lan })
  const account = next(address, { type: 'useAddress', url: 'http://192.168.1.5:8080' })
  assert.equal(account.direction, 'forward')

  const returned = back(account)
  assert.deepEqual(returned.current, address.current)
  assert.equal(returned.direction, 'back')
})

test('back never returns to the scan itself, only to the choice before it', () => {
  const address = next(next(begin('connect'), { type: 'chooseSelfHosted' }), { type: 'discovered', servers: [] })
  assert.equal(back(address).current.step, 'server')
})

test('scanning again from the address leaves Back pointing at the server choice', () => {
  const address = next(next(begin('connect'), { type: 'chooseSelfHosted' }), { type: 'discovered', servers: [] })
  const rescanning = next(address, { type: 'rescan' })
  assert.equal(rescanning.current.step, 'discover')
  const foundNow = next(rescanning, { type: 'discovered', servers: lan })
  assert.equal(back(foundNow).current.step, 'server')
})
