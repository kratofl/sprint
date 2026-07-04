import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const source = 'docs/sprint-ico.svg'
const pngTarget = 'app/build/appicon.png'
const icoTarget = 'app/build/windows/icon.ico'

await mkdir('app/build/windows', { recursive: true })

const svg = await readFile(source)
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
)

await sharp(svg).resize(1024, 1024).png().toFile(pngTarget)
await writeFile(icoTarget, await pngToIco(pngBuffers))
