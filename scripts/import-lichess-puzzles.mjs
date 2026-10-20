// Picks multi-move beginner puzzles from the Lichess puzzle database (CC0) and writes them in the
// Chess Rocket shape to src/data/puzzles/lichess-longer.json.
//
//   1. Download https://database.lichess.org/lichess_db_puzzle.csv.zst (about 300 MB, keep it out of the repo)
//   2. node scripts/import-lichess-puzzles.mjs <path to lichess_db_puzzle.csv.zst or .csv> [--per-motif 40]
//
// The output is deterministic for a given database file, so re-running only changes it when Lichess does.
import { createReadStream, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Transform } from 'node:stream'
import { createZstdDecompress } from 'node:zlib'
import { Chess } from 'chess.js'

const OUT = new URL('../src/data/puzzles/lichess-longer.json', import.meta.url)

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('--'))
const perMotifArg = args.indexOf('--per-motif')
const PER_MOTIF = perMotifArg >= 0 ? Number(args[perMotifArg + 1]) : 40
if (!input) {
  console.error('usage: node scripts/import-lichess-puzzles.mjs <lichess_db_puzzle.csv.zst> [--per-motif 40]')
  process.exit(1)
}

const MIN_RATING = 800
const MAX_RATING = 1600
const MIN_POPULARITY = 90
const MIN_PLAYS = 500
const MAX_RATING_DEVIATION = 100
// Lichess "Moves" starts with the opponent's move, so 6 entries means 3 moves for the solver.
const MIN_MOVES = 6

// First match wins, so a back-rank mate is filed as back_rank_mate rather than checkmate,
// and the endgame bucket is left with technique puzzles instead of mates.
const MOTIFS = [
  { theme: 'backRankMate', motif: 'back_rank_mate', phrase: 'a back-rank mate' },
  { theme: 'skewer', motif: 'skewer', phrase: 'a skewer' },
  { theme: 'pin', motif: 'pin', phrase: 'a pin' },
  { theme: 'fork', motif: 'fork', phrase: 'a fork' },
  { theme: 'mate', motif: 'checkmate', phrase: 'checkmate' },
  { theme: 'endgame', motif: 'endgame', phrase: 'endgame technique' },
]

// The Lichess file is pzstd output: each zstd frame is preceded by a skippable frame holding its
// compressed size. Node's zstd decoder rejects skippable frames, so drop them before decoding.
function stripSkippableFrames() {
  let pending = Buffer.alloc(0)
  let frameLeft = 0
  let passthrough = false
  return new Transform({
    transform(chunk, _enc, done) {
      if (passthrough) return done(null, chunk)
      pending = Buffer.concat([pending, chunk])
      const out = []
      for (;;) {
        if (frameLeft > 0) {
          const n = Math.min(frameLeft, pending.length)
          out.push(pending.subarray(0, n))
          pending = pending.subarray(n)
          frameLeft -= n
          if (frameLeft > 0) break
        }
        if (pending.length < 8) break
        const magic = pending.readUInt32LE(0)
        if ((magic & 0xfffffff0) >>> 0 !== 0x184d2a50) {
          // Not pzstd framing: hand the rest to the decoder unchanged.
          passthrough = true
          out.push(pending)
          pending = Buffer.alloc(0)
          break
        }
        const size = pending.readUInt32LE(4)
        if (pending.length < 8 + size) break
        frameLeft = size === 4 ? pending.readUInt32LE(8) : 0
        pending = pending.subarray(8 + size)
      }
      done(null, Buffer.concat(out))
    },
    flush(done) {
      done(null, pending)
    },
  })
}

function openCsv(path) {
  const file = createReadStream(path)
  return path.endsWith('.zst') ? file.pipe(stripSkippableFrames()).pipe(createZstdDecompress()) : file
}

function uciMove(chess, uci) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
}

function difficulty(rating) {
  if (rating < 1100) return 'beginner'
  if (rating < 1400) return 'intermediate'
  return 'advanced'
}

const candidates = new Map(MOTIFS.map((m) => [m.motif, []]))
let rows = 0

const lines = createInterface({ input: openCsv(input), crlfDelay: Infinity })
let header = null
for await (const line of lines) {
  if (!header) {
    header = line.split(',')
    continue
  }
  rows++
  // No field contains a comma: themes and opening tags are space separated.
  const f = line.split(',')
  const row = Object.fromEntries(header.map((h, i) => [h, f[i]]))
  const rating = Number(row.Rating)
  const moves = row.Moves.split(' ')
  if (rating < MIN_RATING || rating > MAX_RATING) continue
  if (moves.length < MIN_MOVES) continue
  if (Number(row.Popularity) < MIN_POPULARITY || Number(row.NbPlays) < MIN_PLAYS) continue
  if (Number(row.RatingDeviation) > MAX_RATING_DEVIATION) continue
  const themes = new Set(row.Themes.split(' '))
  const m = MOTIFS.find((x) => themes.has(x.theme))
  if (!m) continue
  candidates.get(m.motif).push({ id: row.PuzzleId, fen: row.FEN, moves, rating, plays: Number(row.NbPlays), m })
}

// Spread each motif across the rating range: the most played puzzles from each 100-point band,
// then top up from whatever is left if a band runs short.
const BAND = 100
const bands = (MAX_RATING - MIN_RATING) / BAND
const byPlays = (a, b) => b.plays - a.plays || (a.id < b.id ? -1 : 1)
const picked = []
for (const [motif, list] of candidates) {
  list.sort(byPlays)
  const perBand = Math.ceil(PER_MOTIF / bands)
  const chosen = new Set()
  for (let b = 0; b < bands; b++) {
    const lo = MIN_RATING + b * BAND
    list.filter((p) => p.rating >= lo && p.rating < lo + BAND).slice(0, perBand).forEach((p) => chosen.add(p))
  }
  for (const p of list) if (chosen.size < PER_MOTIF) chosen.add(p)
  const sel = [...chosen].sort(byPlays).slice(0, PER_MOTIF).sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1))
  console.log(`${motif}: ${list.length} candidates, ${sel.length} picked`)
  picked.push(...sel)
}

const out = []
for (const p of picked) {
  const chess = new Chess(p.fen)
  // Lichess positions start one move early: play the opponent's move to reach the puzzle.
  uciMove(chess, p.moves[0])
  const fen = chess.fen()
  const solution = p.moves.slice(1)
  const san = solution.map((uci) => uciMove(chess, uci).san)
  const solverMoves = Math.ceil(solution.length / 2)
  out.push({
    fen,
    solution_moves: solution,
    solution_san: san,
    motif: p.m.motif,
    difficulty: difficulty(p.rating),
    difficulty_rating: p.rating,
    explanation: `${san[0]} starts a ${solverMoves}-move combination built on ${p.m.phrase}. From a real game on Lichess (puzzle ${p.id}).`,
    source: `lichess:${p.id}`,
  })
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(`read ${rows} puzzles, wrote ${out.length} to ${OUT.pathname}`)
