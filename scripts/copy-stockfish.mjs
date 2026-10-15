import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Copies the Stockfish WASM builds from node_modules into public/stockfish so
// the browser can load them as plain static files (the engine must be loaded
// as a classic Web Worker from a same-origin URL). Runs on install and before
// dev/build. Idempotent: skips files that are already present and the same size.
const require = createRequire(import.meta.url)
const binDir = dirname(require.resolve('stockfish/package.json')) + '/bin'
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'stockfish')
mkdirSync(outDir, { recursive: true })

const files = [
  'stockfish-19.js',
  'stockfish-19.wasm',
  'stockfish-19-single.js',
  'stockfish-19-single.wasm',
  'stockfish-19-lite.js',
  'stockfish-19-lite.wasm',
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
]
let copied = 0
for (const f of files) {
  const src = join(binDir, f)
  const dst = join(outDir, f)
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue
  copyFileSync(src, dst)
  copied++
}
console.log(`stockfish: ${copied} file(s) copied to public/stockfish (${files.length - copied} already up to date)`)
