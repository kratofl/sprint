import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { TextLine } from './primitives'

test('sizing="fit" shrinks long text to fit maxWidth instead of truncating it', () => {
  // A width far too small for "SECTORS" at this font size — the bug this fixes rendered this
  // as a CSS ellipsis ("SEC..."). It must now shrink the glyphs to the box, not cut the string.
  const html = renderToStaticMarkup(
    <TextLine text="SECTORS" left={8} top={20} size={26} color="#fff" align="start" maxWidth={40} weight="label" sizing="fit" />,
  )
  assert.ok(html.includes('>SECTORS<'), `expected the full word, got: ${html}`)
  assert.ok(!html.includes('…') && !html.includes('...'), `expected no ellipsis, got: ${html}`)
  assert.match(html, /textLength="40"/)
  assert.match(html, /lengthAdjust="spacingAndGlyphs"/)
})

test('sizing="fit" does not stretch text that already fits maxWidth', () => {
  const html = renderToStaticMarkup(
    <TextLine text="OK" left={8} top={20} size={12} color="#fff" align="start" maxWidth={200} weight="label" sizing="fit" />,
  )
  assert.ok(!html.includes('textLength'), `short text should render as a plain span, not a stretched SVG text: ${html}`)
  assert.match(html, /<span/)
})

test('the default "stable" sizing clips overflow without an ellipsis (matches DashPainter\'s non-Fit clip, used for dynamic values so they never resize)', () => {
  const html = renderToStaticMarkup(
    <TextLine text="1:32.456" left={8} top={20} size={26} color="#fff" align="end" maxWidth={20} weight="value" />,
  )
  assert.ok(!html.includes('…') && !html.includes('...'), `expected no ellipsis, got: ${html}`)
  assert.ok(!html.includes('text-overflow'), `expected no CSS ellipsis rule, got: ${html}`)
})

test('stable sizing anchors the clip rect and the text inside it per align, so overflow clips away from the anchor (matches DrawTextLine, not always-clip-right)', () => {
  // align="end": DrawTextLine's clip rect is [left - maxWidth, left], and textX puts the text's
  // right edge at `left`. Overflow must spill — and clip — to the LEFT, keeping trailing chars.
  const end = renderToStaticMarkup(
    <TextLine text="1:32.456" left={100} top={20} size={26} color="#fff" align="end" maxWidth={40} weight="value" />,
  )
  assert.match(end, /left:\s*60px/, `clip box should sit at left - maxWidth (60), got: ${end}`)
  assert.match(end, /width:\s*40px/, `clip box width should be maxWidth (40), got: ${end}`)
  assert.match(end, /left:\s*40px/, `inner text should anchor its right edge at maxWidth (40) within the box, got: ${end}`)
  assert.match(end, /translate\(-100%, -50%\)/, `inner text should be right-anchored (translateX -100%), got: ${end}`)

  // align="start": clip rect is [left, left + maxWidth], textX = left. Overflow spills right.
  const start = renderToStaticMarkup(
    <TextLine text="1:32.456" left={100} top={20} size={26} color="#fff" align="start" maxWidth={40} weight="value" />,
  )
  assert.match(start, /left:\s*100px/, `clip box should sit at left (100), got: ${start}`)
  assert.match(start, /translate\(0%, -50%\)/, `inner text should be left-anchored (translateX 0%), got: ${start}`)

  // align="center": clip rect is [left - maxWidth/2, left + maxWidth/2], text centered inside it,
  // so overflow spills — and clips — evenly on both sides.
  const center = renderToStaticMarkup(
    <TextLine text="1:32.456" left={100} top={20} size={26} color="#fff" align="center" maxWidth={40} weight="value" />,
  )
  assert.match(center, /left:\s*80px/, `clip box should sit at left - maxWidth\\/2 (80), got: ${center}`)
  assert.match(center, /left:\s*20px/, `inner text should anchor its center at maxWidth\\/2 (20) within the box, got: ${center}`)
  assert.match(center, /translate\(-50%, -50%\)/, `inner text should be center-anchored (translateX -50%), got: ${center}`)
})

test('stable sizing never uses text-align to decide clip direction (a plain text-align + overflow:hidden span always clips overflowing nowrap text on the right)', () => {
  const html = renderToStaticMarkup(
    <TextLine text="1:32.456" left={100} top={20} size={26} color="#fff" align="end" maxWidth={40} weight="value" />,
  )
  assert.ok(!html.includes('text-align'), `should not rely on text-align for clip direction, got: ${html}`)
})

test('sizing="fit" picks the label font (Inter) for label weights and the value font (Saira SemiCondensed) for value weights when it shrinks', () => {
  const label = renderToStaticMarkup(
    <TextLine text="VIRTUAL ENERGY BUDGET REMAINING" left={8} top={20} size={20} color="#fff" align="start" maxWidth={30} weight="labelBold" sizing="fit" />,
  )
  assert.match(label, /font-family="Inter/)

  const flagValue = renderToStaticMarkup(
    <TextLine text="SAFETY CAR DEPLOYED" left={8} top={20} size={20} color="#fff" align="center" maxWidth={30} weight="valueRegular" sizing="fit" />,
  )
  assert.match(flagValue, /font-family="Saira/)
})
