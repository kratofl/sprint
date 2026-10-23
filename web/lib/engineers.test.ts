import test from 'node:test'
import assert from 'node:assert/strict'
import { accessRow, accessSummary, driverFilterOptions, invitePreview, matchesDriver } from './engineers.ts'

const sam = { id: 'e1', displayName: 'Sam Reed', avatarUrl: null }
const kim = { id: 'e2', displayName: 'Kim Vos', avatarUrl: null }
const alex = { id: 'd1', displayName: 'Alex Morgan', avatarUrl: null }

test('the access summary names who a session is hidden from', () => {
  assert.equal(accessSummary([]), 'You have no race engineers yet.')
  assert.equal(accessSummary([{ engineer: sam, hasAccess: true }]), 'Sam Reed can see this session.')
  assert.equal(accessSummary([{ engineer: sam, hasAccess: true }, { engineer: kim, hasAccess: true }]), 'All 2 of your engineers can see this session.')
  assert.equal(accessSummary([{ engineer: sam, hasAccess: false }, { engineer: kim, hasAccess: true }]), 'Hidden from Sam Reed.')
  assert.equal(accessSummary([{ engineer: sam, hasAccess: false }]), 'Hidden from your engineer.')
  assert.equal(accessSummary([{ engineer: sam, hasAccess: false }, { engineer: kim, hasAccess: false }]), 'Hidden from all 2 of your engineers.')
  const three = [{ engineer: sam, hasAccess: false }, { engineer: kim, hasAccess: false }, { engineer: alex, hasAccess: true }]
  assert.equal(accessSummary(three), 'Hidden from 2 of 3 engineers.')
})

test('an engineer row says what they see and offers the reverse', () => {
  assert.deepEqual(accessRow({ engineer: sam, hasAccess: true }), {
    engineer: sam,
    status: 'Can see this session, live and afterwards',
    action: { change: 'exclude', label: 'Hide from Sam Reed' },
  })
  assert.deepEqual(accessRow({ engineer: sam, hasAccess: false }), {
    engineer: sam,
    status: 'Hidden from this session',
    action: { change: 'include', label: 'Show to Sam Reed' },
  })
})

test('an invite link says who sent it while it can be accepted, and why not otherwise', () => {
  assert.deepEqual(invitePreview({ status: 'VALID', driver: alex, expiresAt: '2026-10-19T12:00:00Z' }, null), {
    kind: 'valid',
    driver: alex,
    expiresAt: '2026-10-19T12:00:00Z',
  })
  assert.deepEqual(invitePreview({ status: 'EXPIRED', driver: alex, expiresAt: '2026-10-01T12:00:00Z' }, 'e1'), {
    kind: 'closed',
    title: 'This invite has expired',
    body: 'Invite links work for 7 days. Ask Alex Morgan for a new one.',
  })
  assert.deepEqual(invitePreview({ status: 'USED', driver: alex, expiresAt: null }, 'e1'), {
    kind: 'closed',
    title: 'This invite was already used',
    body: 'Each link works once. Ask Alex Morgan for a new one.',
  })
  assert.deepEqual(invitePreview({ status: 'REVOKED', driver: alex, expiresAt: null }, 'e1'), {
    kind: 'closed',
    title: 'This invite was withdrawn',
    body: 'Alex Morgan withdrew this link. Ask them for a new one if you still engineer for them.',
  })
  assert.deepEqual(invitePreview({ status: 'NOT_FOUND', driver: null, expiresAt: null }, 'e1'), {
    kind: 'closed',
    title: 'This invite doesn’t exist',
    body: 'Check that you opened the whole link, or ask the driver for a new one.',
  })
  // A valid status without a driver cannot be accepted honestly.
  assert.equal(invitePreview({ status: 'VALID', driver: null, expiresAt: null }, 'e1').kind, 'closed')
})

test('a driver opening their own invite link is told to send it on instead', () => {
  assert.deepEqual(invitePreview({ status: 'VALID', driver: alex, expiresAt: null }, 'd1'), {
    kind: 'closed',
    title: 'This is your own invite',
    body: 'Send this link to the person who should be your race engineer.',
  })
})

test('the driver filter offers you, then every other driver by name, and filters by owner', () => {
  const sessions = [
    { isMine: false, driver: sam },
    { isMine: true, driver: alex },
    { isMine: false, driver: kim },
    { isMine: false, driver: sam },
  ]
  assert.deepEqual(driverFilterOptions(sessions), [
    { value: 'all', label: 'All drivers' },
    { value: 'me', label: 'You' },
    { value: 'e2', label: 'Kim Vos' },
    { value: 'e1', label: 'Sam Reed' },
  ])
  assert.deepEqual(
    sessions.filter((session) => matchesDriver(session, 'me')),
    [{ isMine: true, driver: alex }],
  )
  assert.equal(sessions.filter((session) => matchesDriver(session, 'e1')).length, 2)
  assert.equal(sessions.filter((session) => matchesDriver(session, 'all')).length, 4)
})
