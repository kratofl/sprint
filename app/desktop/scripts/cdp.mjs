#!/usr/bin/env node
// Drives the main window of an agent run (scripts/agent-app.mjs) over the DevTools protocol.
// One command per call, so each step can be checked before the next:
//
//   node scripts/cdp.mjs <run folder | port> shot <out.png>      screenshot of the window
//   node scripts/cdp.mjs <run folder | port> click <selector>    click the first match (waits up to 5 s)
//   node scripts/cdp.mjs <run folder | port> type <selector> <text>  focus it, select all, type the text
//   node scripts/cdp.mjs <run folder | port> key <key>           press a key: Enter, Escape, Tab, ArrowDown, …
//   node scripts/cdp.mjs <run folder | port> eval <expression>   print the (awaited) result as JSON
//   node scripts/cdp.mjs <run folder | port> wait <selector> [ms]  until it exists (default 5 s)
//
// Clicks and keys go through Input.dispatch*, so React sees real events. The window is hidden,
// so a click lands on the element's centre whatever is on the screen.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { cdpPort, connect } from './cdp-client.mjs'

const [where, command, ...args] = process.argv.slice(2)
const fail = (message) => {
  console.error(`[cdp] ${message}`)
  process.exit(1)
}
if (!where || !command) fail('usage: cdp.mjs <run folder | port> <shot|click|type|key|eval|wait> …')

const port = cdpPort(where)
if (!port) fail(`no CDP port for ${where} (is the run up yet?)`)

// SPRINT_CDP_PAGE=<text> drives another window instead, the first whose URL holds that text (e.g. pitwall=main).
const page = await connect(port, process.env.SPRINT_CDP_PAGE ?? 'backdrop=window').catch((error) => fail(error.message))

try {
  if (command === 'shot') {
    const out = args[0] ?? fail('shot needs an output path')
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(out, Buffer.from(data, 'base64'))
    console.log(`[cdp] wrote ${path.resolve(out)}`)
  } else if (command === 'click') {
    await page.click(args[0] ?? fail('click needs a selector'))
  } else if (command === 'type') {
    const [selector, text] = args
    if (!selector || text === undefined) fail('type needs a selector and the text')
    await page.click(selector)
    await page.evaluate(`document.activeElement?.select?.()`)
    await page.send('Input.insertText', { text })
  } else if (command === 'key') {
    await page.press(args[0] ?? fail('key needs a key name'))
  } else if (command === 'eval') {
    console.log(JSON.stringify(await page.evaluate(args[0] ?? fail('eval needs an expression')), null, 2))
  } else if (command === 'wait') {
    const selector = args[0] ?? fail('wait needs a selector')
    if (!(await page.locate(selector, Number(args[1] ?? 5000)))) fail(`${selector} did not show up`)
  } else {
    fail(`unknown command ${command}`)
  }
} catch (error) {
  fail(error.message)
} finally {
  page.close()
}
