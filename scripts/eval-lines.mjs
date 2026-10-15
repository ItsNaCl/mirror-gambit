// Evaluate one or more SAN move lists with Stockfish at depth 18.
// Usage: node scripts/eval-lines.mjs "1. e4 e5 2. Nf3" "1. d4 d5 2. c4" ...
// Or with a file: node scripts/eval-lines.mjs --file lines.txt   (one line per row, "# comment" allowed)
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { startEngine } from './engine-node.mjs'

const args = process.argv.slice(2)
let lines = args
if (args[0] === '--file') {
  lines = readFileSync(args[1], 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}
const depth = Number(process.env.DEPTH ?? 18)
const engine = startEngine({ threads: 8, hash: 256 })
await engine.ready
for (const line of lines) {
  const chess = new Chess()
  const sans = line.split(/\s+/).filter((t) => !/^\d+\.(\.\.)?$/.test(t))
  let illegal = null
  for (const san of sans) {
    try {
      chess.move(san)
    } catch {
      illegal = san
      break
    }
  }
  if (illegal) {
    console.log(`ILLEGAL (${illegal}): ${line}`)
    continue
  }
  const r = await engine.evaluate(chess.fen(), depth)
  const sign = chess.turn() === 'w' ? 1 : -1 // convert to White's perspective
  const score = r.mate != null ? `M${r.mate * sign}` : ((r.cp * sign) / 100).toFixed(2)
  console.log(`${score.padStart(6)}  best=${r.bestmove}  ${line}`)
}
engine.quit()
