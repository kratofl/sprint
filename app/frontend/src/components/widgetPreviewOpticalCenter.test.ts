import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const widgetPreviewSource = readFileSync(
  new URL('./WidgetPreview.tsx', import.meta.url),
  'utf8',
)

test('widget preview applies optical centering for marked text elements', () => {
  assert.match(widgetPreviewSource, /measureOpticalCenterOffset/)
  assert.match(widgetPreviewSource, /elem\.opticalCenter === true && elem\.hAlign === 1/)
  assert.match(widgetPreviewSource, /transformWithOpticalOffset/)
})
