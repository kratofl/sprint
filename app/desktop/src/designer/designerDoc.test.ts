import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout } from '@sprint/dashboard'
import { editDoc, isDirty, openDesignerDoc, receiveHost, redoDoc, saveFailed, saveStatus, saveSucceeded, undoDoc } from './designerDoc'

const dash = (name: string, extra: Partial<DashLayout> = {}): DashLayout => ({
  id: 'dash-1',
  name,
  mode: 'basic',
  gridCols: 20,
  gridRows: 12,
  pages: [{ id: 'driving', name: 'Driving', widgets: [{ id: 'tc', type: 'tc', col: 0, row: 0, colSpan: 3, rowSpan: 2 }] }],
  alerts: [],
  ...extra,
})

test('an edit is saving until the host confirms that version', () => {
  let doc = editDoc(openDesignerDoc(dash('A')), dash('B'))
  assert.equal(saveStatus(doc), 'saving')
  const sent = doc.version
  doc = editDoc(doc, dash('C'))
  doc = saveSucceeded(doc, sent)
  assert.ok(isDirty(doc), 'a later edit still waits for its own save')
  doc = saveSucceeded(doc, doc.version)
  assert.equal(saveStatus(doc), 'saved')
})

test('a failed save says so until the next edit tries again', () => {
  let doc = saveFailed(editDoc(openDesignerDoc(dash('A')), dash('B')), 'offline')
  assert.equal(saveStatus(doc), 'failed')
  doc = editDoc(doc, dash('C'))
  assert.equal(saveStatus(doc), 'saving')
  doc = saveSucceeded(doc, doc.version)
  assert.equal(saveStatus(doc), 'saved')
})

test('undo and redo are edits to save', () => {
  let doc = saveSucceeded(editDoc(openDesignerDoc(dash('A')), dash('B')), 1)
  doc = undoDoc(doc)
  assert.equal(doc.history.present.name, 'A')
  assert.ok(isDirty(doc))
  doc = redoDoc(saveSucceeded(doc, doc.version))
  assert.equal(doc.history.present.name, 'B')
  assert.ok(isDirty(doc))
})

test("the host's copy never replaces edits that are not saved yet", () => {
  const doc = editDoc(openDesignerDoc(dash('A')), dash('Mine'))
  const next = receiveHost(doc, dash('Theirs'))
  assert.equal(next.history.present.name, 'Mine')
})

test('our own save coming back in the host spelling is not a change', () => {
  const mine = dash('B', { idlePage: null })
  let doc = saveSucceeded(editDoc(openDesignerDoc(dash('A')), mine), 1)
  // The host spells absent values as null and lists every collection, in its own key order.
  const echo: DashLayout = {
    alerts: [],
    gridRows: 12,
    gridCols: 20,
    id: 'dash-1',
    mode: 'basic',
    name: 'B',
    pages: [{ id: 'driving', name: 'Driving', groups: [], widgets: [{ id: 'tc', type: 'tc', col: 0, row: 0, colSpan: 3, rowSpan: 2, config: undefined, style: undefined }] }],
  }
  doc = receiveHost(doc, echo)
  assert.equal(doc.history.past.length, 1, 'no extra step')
  assert.equal(doc.history.present, mine)
})

test('a host change while nothing is unsaved becomes an undoable step', () => {
  let doc = receiveHost(openDesignerDoc(dash('A')), dash('Reset'))
  assert.equal(doc.history.present.name, 'Reset')
  assert.equal(saveStatus(doc), 'saved', 'the host already has it')
  doc = undoDoc(doc)
  assert.equal(doc.history.present.name, 'A')
  assert.ok(isDirty(doc), 'undoing it saves the old design back')
})

test('a new category follows the host without a step', () => {
  const doc = receiveHost(openDesignerDoc(dash('A')), dash('A', { category: 'Race' }))
  assert.equal(doc.history.present.category, 'Race')
  assert.equal(doc.history.past.length, 0)
})
