// Generates the app icon: two mirrored pawns (one light, one dark) on the app's
// dark theme colours. Writes build/icon.svg, build/icon.png (512) and a
// multi-size build/icon.ico (16, 24, 32, 48, 64, 128, 256) with PNG entries.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'build')
mkdirSync(outDir, { recursive: true })

// A simple pawn silhouette drawn in a 100x100 box, base centred at (50, 92).
const pawn = `M50 12
  a12 12 0 1 1 -0.01 0
  M38 30 h24 l-3 7 h-18 z
  M41 37 h18 c5 12 7 20 12 30 h-42 c5 -10 7 -18 12 -30 z
  M28 70 h44 l4 10 h-52 z
  M22 82 h56 v10 h-56 z`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a2f3a"/>
      <stop offset="1" stop-color="#121419"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="url(#bg)" stroke="#5b9cff" stroke-width="6"/>
  <!-- mirror line -->
  <line x1="128" y1="40" x2="128" y2="216" stroke="#5b9cff" stroke-width="3" stroke-dasharray="6 8" opacity="0.7"/>
  <!-- light pawn, left -->
  <g transform="translate(22 60) scale(1.0)">
    <path d="${pawn}" fill="#e9e4d6" stroke="#121419" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <!-- dark pawn, right (mirrored) -->
  <g transform="translate(234 60) scale(-1 1)">
    <path d="${pawn}" fill="#7b8aa0" stroke="#e9e4d6" stroke-width="3" stroke-linejoin="round"/>
  </g>
</svg>`

writeFileSync(join(outDir, 'icon.svg'), svg)

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = []
for (const size of sizes) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  pngs.push({ size, buf })
}
writeFileSync(join(outDir, 'icon.png'), await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer())

// ICO container: header (6 bytes) + directory entries (16 bytes each) + PNG payloads.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(pngs.length, 4)
const dir = Buffer.alloc(16 * pngs.length)
let offset = 6 + dir.length
pngs.forEach(({ size, buf }, i) => {
  const o = i * 16
  dir.writeUInt8(size === 256 ? 0 : size, o) // width (0 means 256)
  dir.writeUInt8(size === 256 ? 0 : size, o + 1) // height
  dir.writeUInt8(0, o + 2) // palette
  dir.writeUInt8(0, o + 3) // reserved
  dir.writeUInt16LE(1, o + 4) // colour planes
  dir.writeUInt16LE(32, o + 6) // bits per pixel
  dir.writeUInt32LE(buf.length, o + 8)
  dir.writeUInt32LE(offset, o + 12)
  offset += buf.length
})
writeFileSync(join(outDir, 'icon.ico'), Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]))
console.log(`icon written: build/icon.ico (${sizes.join(', ')} px), build/icon.png, build/icon.svg`)
