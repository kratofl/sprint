#!/usr/bin/env node
// Regenerates the macOS app icons from the square brand artwork:
//   resources/icon-mac.png  1024px, for app.dock.setIcon in dev runs
//   resources/icon.icns     the bundle icon (packaged app and the dev bundle)
// Run from anywhere: `node app/desktop/scripts/icons/make-mac-icon.mjs` (macOS only,
// needs iconutil). Commit the outputs; nothing regenerates them at build time.
//
// Both hold the artwork already shaped to Apple's icon grid: a 824px continuous-
// corner squircle centred on a 1024px canvas with a transparent margin. The Dock
// shows app.dock.setIcon images unmasked, and macOS 26+ shrinks a legacy .icns that
// does not fit that shape into a grey tile, so a full-bleed square would sit larger
// than (or smaller than, in its tile) every neighbour.
//
// Runs twice: under Node it launches Electron on this same file, which renders every
// iconset size from the vector source with a canvas; Node then builds the .icns.
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const desktopRoot = path.resolve(path.dirname(scriptPath), '..', '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const source = path.join(repoRoot, 'packages', 'ui', 'src', 'assets', 'brand', 'sprint-square.svg')
const scratch = path.join(desktopRoot, 'dist-icon')
const iconset = path.join(scratch, 'Sprint.iconset')

// Pixel size -> iconset file names (iconutil requires exactly these names).
const iconsetFiles = {
  16: ['icon_16x16.png'],
  32: ['icon_16x16@2x.png', 'icon_32x32.png'],
  64: ['icon_32x32@2x.png'],
  128: ['icon_128x128.png'],
  256: ['icon_128x128@2x.png', 'icon_256x256.png'],
  512: ['icon_256x256@2x.png', 'icon_512x512.png'],
  1024: ['icon_512x512@2x.png'],
}

const shapeSpec = {
  // Apple's macOS icon grid on a 1024 canvas: the body is 824px, inset 100px.
  canvas: 1024,
  body: 824,
  // Superellipse exponent approximating Apple's continuous-corner icon shape.
  exponent: 5,
  // The brand tile's edge (sprint-icon.svg strokes its tile in #2E2E2E) keeps the
  // black body from dissolving into a dark Dock. Width is in 1024-canvas pixels.
  edgeColor: '#2E2E2E',
  edgeWidth: 6,
}

/**
 * Runs inside the render page (serialised via toString, so it must be
 * self-contained). Returns base64 PNG data keyed by pixel size.
 */
async function renderInPage(svg, sizes, spec) {
  const image = new Image()
  image.src = `data:image/svg+xml;base64,${btoa(svg)}`
  await image.decode()
  const out = {}
  for (const size of sizes) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const k = size / spec.canvas
    const half = (spec.body * k) / 2
    const centre = size / 2
    const shape = new Path2D()
    const steps = 720
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * 2 * Math.PI
      const cos = Math.cos(t)
      const sin = Math.sin(t)
      const x = centre + half * Math.sign(cos) * Math.abs(cos) ** (2 / spec.exponent)
      const y = centre + half * Math.sign(sin) * Math.abs(sin) ** (2 / spec.exponent)
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    ctx.imageSmoothingQuality = 'high'
    ctx.save()
    ctx.clip(shape)
    ctx.drawImage(image, centre - half, centre - half, half * 2, half * 2)
    // Stroked on the clip boundary, so only the inner half shows.
    ctx.strokeStyle = spec.edgeColor
    ctx.lineWidth = spec.edgeWidth * 2 * k
    ctx.stroke(shape)
    ctx.restore()
    out[size] = canvas.toDataURL('image/png').split(',')[1]
  }
  return out
}

async function renderWithElectron() {
  const { app, BrowserWindow } = await import('electron')
  app.setPath('userData', path.join(scratch, 'electron-profile'))
  app.commandLine.appendSwitch('use-mock-keychain')
  app.dock?.hide()
  await app.whenReady()
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  await window.loadURL('data:text/html,<!doctype html><title>icon</title>')
  const sizes = Object.keys(iconsetFiles).map(Number)
  const args = [readFileSync(source, 'utf8'), sizes, shapeSpec].map((arg) => JSON.stringify(arg)).join(', ')
  const pngs = await window.webContents.executeJavaScript(`(${renderInPage.toString()})(${args})`)
  mkdirSync(iconset, { recursive: true })
  for (const [size, names] of Object.entries(iconsetFiles)) {
    for (const name of names) writeFileSync(path.join(iconset, name), Buffer.from(pngs[size], 'base64'))
  }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('make-mac-icon needs macOS (iconutil).')
  rmSync(scratch, { recursive: true, force: true })
  const { default: electronPath } = await import('electron')
  // ELECTRON_RUN_AS_NODE would make Electron run this file as plain Node again.
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [scriptPath], { stdio: 'inherit', env })
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`Electron render exited with code ${code}`)
  const resources = path.join(desktopRoot, 'resources')
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'icon.icns')], { stdio: 'inherit' })
  copyFileSync(path.join(iconset, 'icon_512x512@2x.png'), path.join(resources, 'icon-mac.png'))
  rmSync(scratch, { recursive: true, force: true })
  console.log(`Wrote ${path.join(resources, 'icon.icns')} and icon-mac.png`)
}

if (process.versions.electron) {
  const { app } = await import('electron')
  renderWithElectron()
    .then(() => app.exit(0))
    .catch((error) => {
      console.error(error)
      app.exit(1)
    })
} else {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
