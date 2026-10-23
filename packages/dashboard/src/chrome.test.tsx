import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { frameGeometry, WidgetFrame, type ChromeContext } from './chrome'
import { dashSettingColors, defaultDashPalette } from './palette'

const at = (style: ChromeContext['style']): ChromeContext => ({ style, scale: 1 })
const cell = { left: 0, top: 0, width: 120, height: 120 }

test('panels keep a gap between neighbouring frames; grid frames overlap their neighbours into one shared line', () => {
  const panels = frameGeometry(at('panels'), 120, 120, true)
  assert.equal(panels.box.left, 4, 'half of an 8px gap on each side of a cell edge')
  const grid = frameGeometry(at('grid'), 120, 120, true)
  assert.equal(grid.box.left, -1, 'a 2px line centred on the cell edge')
})

test('the content box sits below the title band in every style, and fills the frame when untitled', () => {
  for (const style of ['panels', 'grid', 'bars'] as const) {
    const titled = frameGeometry(at(style), 120, 120, true)
    assert.ok(titled.title && titled.content.top >= titled.title.top + titled.title.height, style)
    const untitled = frameGeometry(at(style), 120, 120, false)
    assert.equal(untitled.title, null)
    assert.ok(untitled.content.height > titled.content.height, style)
  }
})

test('chrome scales with the grid cell, so a larger panel keeps the same proportions', () => {
  const small = frameGeometry({ style: 'bars', scale: 1 }, 120, 120, true)
  const large = frameGeometry({ style: 'bars', scale: 2 }, 240, 240, true)
  assert.equal(large.title!.height, small.title!.height * 2)
})

test('a knob carries its identity color in the border for panels and in the title bar for bars', () => {
  const render = (style: ChromeContext['style']) =>
    renderToStaticMarkup(
      <WidgetFrame ctx={at(style)} rect={cell} title="TC" accent={dashSettingColors.tc} fill={null} palette={defaultDashPalette}>
        {() => null}
      </WidgetFrame>,
    )
  assert.match(render('panels'), new RegExp(`border:2px solid ${dashSettingColors.tc}`, 'i'))
  const bars = render('bars')
  assert.match(bars, new RegExp(`border:2px solid ${defaultDashPalette.border}`, 'i'))
  assert.match(bars, new RegExp(`background:${dashSettingColors.tc}`, 'i'))
})

test('a fill covers the frame and hands its content an ink palette', () => {
  let contentText = ''
  renderToStaticMarkup(
    <WidgetFrame ctx={at('panels')} rect={cell} title="DELTA" accent={null} fill={defaultDashPalette.timingPersonalBest} palette={defaultDashPalette}>
      {(_, palette) => {
        contentText = palette.foreground
        return null
      }}
    </WidgetFrame>,
  )
  assert.equal(contentText, defaultDashPalette.background)
})
