// Makes short puzzles longer by extending their solutions with Stockfish.
// Usage: node scripts/extend-puzzles.mjs            (all sets, rewrites the JSON in place)
//        DEPTH=16 TARGET=4 node scripts/extend-puzzles.mjs forks pins
//
// For every puzzle with fewer than TARGET solver moves, the script plays the
// solution, then repeatedly asks Stockfish for the opponent's best reply and the
// solver's best answer. The extension is only kept while the solver's move is
// clearly the right one: the solver stays winning (mate, or at least +2) and the
// best move is either a mate or at least 1.5 pawns better than the second-best move.
// It stops at the first position where that is not true, so every puzzle still
// ends on a solver move. Opening-move puzzles ("find the book move") are left alone.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { startEngine } from './engine-node.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'src', 'data', 'puzzles')

const DEPTH = Number(process.env.DEPTH ?? 16)
/** Solver moves a puzzle should have after extension (at most). */
const TARGET = Number(process.env.TARGET ?? 4)
const WINNING_CP = 200
const UNIQUE_GAP_CP = 150

const SETS = {
  forks: 'forks.json',
  pins: 'pins.json',
  skewers: 'skewers.json',
  'back-rank': 'back-rank.json',
  'checkmate-patterns': 'checkmate-patterns.json',
  endgames: 'beginner-endgames.json',
  'opening-traps': 'opening-traps.json',
}

const wanted = process.argv.slice(2)
const sets = wanted.length ? Object.fromEntries(Object.entries(SETS).filter(([k]) => wanted.includes(k))) : SETS

function uciMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
}

/** Collapses a line's score to one number from the side to move's view; mates sort beyond any cp value. */
function value(line) {
  if (!line) return -Infinity
  if (line.mate != null) return line.mate > 0 ? 100000 - line.mate : -100000 - line.mate
  return line.cp
}

/** The solver's best move if it is clearly the only good one, otherwise null. */
function clearBest(lines) {
  const [best, second] = lines
  if (!best || !best.pv[0]) return null
  if (best.mate != null && best.mate > 0) return best.pv[0]
  if (best.cp == null || best.cp < WINNING_CP) return null
  if (!second) return best.pv[0]
  return value(best) - value(second) >= UNIQUE_GAP_CP ? best.pv[0] : null
}

const engine = startEngine({ threads: 8, hash: 256 })
await engine.ready

let extended = 0
let movesAdded = 0
let total = 0
for (const [setId, file] of Object.entries(sets)) {
  const path = join(dataDir, file)
  const puzzles = JSON.parse(readFileSync(path, 'utf8'))
  let setExtended = 0
  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i]
    total++
    const chess = new Chess(p.fen)
    try {
      for (const uci of p.solution_moves) chess.move(uciMove(uci))
    } catch {
      continue // invalid puzzles are dropped by the app's own validation
    }
    const moves = [...p.solution_moves]
    const sans = chess.history()
    while (Math.ceil(moves.length / 2) < TARGET && !chess.isGameOver()) {
      const reply = await engine.analyse(chess.fen(), DEPTH, 1)
      if (!reply.bestmove || reply.bestmove === '(none)') break
      const afterReply = new Chess(chess.fen())
      const replyMove = afterReply.move(uciMove(reply.bestmove))
      if (afterReply.isGameOver()) break
      const answer = await engine.analyse(afterReply.fen(), DEPTH, 2)
      const best = clearBest(answer.lines)
      if (!best) break
      const answerMove = afterReply.move(uciMove(best))
      chess.load(afterReply.fen())
      moves.push(reply.bestmove, best)
      sans.push(replyMove.san, answerMove.san)
    }
    if (moves.length > p.solution_moves.length) {
      movesAdded += (moves.length - p.solution_moves.length) / 2
      puzzles[i] = { ...p, solution_moves: moves, solution_san: sans, extended_from: p.solution_moves.length }
      setExtended++
      extended++
    }
    process.stdout.write(`\r${setId}: ${i + 1}/${puzzles.length} (${setExtended} extended)   `)
  }
  if (setExtended > 0) writeFileSync(path, JSON.stringify(puzzles, null, 2) + '\n')
  process.stdout.write('\n')
}
engine.quit()
console.log(`Extended ${extended} of ${total} puzzles, ${movesAdded} solver moves added (depth ${DEPTH}, target ${TARGET}).`)
