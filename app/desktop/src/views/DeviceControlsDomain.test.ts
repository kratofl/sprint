import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buttonGroups, buttonName, buttonRows, readableRotation, ringSegments, zoomTransform } from './DeviceControlsDomain'

test('an 8-position dial has its boxes in pairs, the first at the top right', () => {
  const angles = ringSegments(8).map((segment) => segment.angle)
  assert.deepEqual(angles, [-67.5, -22.5, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5])
  assert.ok(!angles.includes(-90), 'no box sits dead centre at the top')
})

test('box names never read upside down', () => {
  for (const degrees of [-90, 0, 45, 90, 135, 180, 225, 270, 337.5]) {
    const rotation = readableRotation(degrees)
    assert.ok(rotation >= -90 && rotation <= 90, `${degrees}° gave ${rotation}°`)
  }
  assert.equal(readableRotation(337.5), -22.5)
})

test('zooming on the picture centre leaves it in the middle of the stage', () => {
  assert.equal(zoomTransform(0.5, 0.5, 2), 'translate(-50%, -50%) scale(2)')
  assert.equal(zoomTransform(0.25, 0.75, 2), 'translate(0%, -100%) scale(2)')
})

test('a button reads as the driver would say it, and each function finds its button', () => {
  assert.equal(buttonName('button:5'), 'Button 5')
  assert.equal(buttonName('encoder:2+'), 'Encoder 2 +')
  assert.equal(buttonName('encoder:2-'), 'Encoder 2 −')
  assert.equal(buttonName('key:F1'), 'key:F1')
  assert.deepEqual(
    buttonRows([{ id: 'dash.page.next', label: 'Next dash page' }, { id: 'dash.page.prev', label: 'Previous dash page' }], [{ input: 'button:5', command: 'dash.page.next' }]),
    [
      { id: 'dash.page.next', label: 'Next dash page', input: 'button:5' },
      { id: 'dash.page.prev', label: 'Previous dash page', input: null },
    ],
  )
})

test('the Buttons card keeps the dash functions apart from the app ones, and leaves out an empty group', () => {
  const ack = { id: 'acknowledge', label: 'Acknowledge' }
  const hud = { id: 'compare.hud.toggle', label: 'Show or hide the HUD' }
  const groups = buttonGroups([{ id: 'dash.page.next', label: 'Next dash page' }, ack, hud], [{ input: 'button:7', command: 'acknowledge' }])
  assert.deepEqual(
    groups.map((group) => [group.title, group.rows.map((row) => row.id)]),
    [
      ['Dash', ['dash.page.next']],
      ['App', ['acknowledge', 'compare.hud.toggle']],
    ],
  )
  assert.equal(groups[1]?.rows[0]?.input, 'button:7')
  assert.deepEqual(
    buttonGroups([ack, hud], []).map((group) => group.title),
    ['App'],
  )
})
