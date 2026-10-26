// Picks multi-move beginner puzzles from the Lichess puzzle database (CC0) and writes them in the
// Chess Rocket shape to src/data/puzzles/lichess-longer.json.
//
//   1. Download https://database.lichess.org/lichess_db_puzzle.csv.zst (about 300 MB, keep it out of the repo)
//   2. node scripts/import-lichess-puzzles.mjs <path to lichess_db_puzzle.csv.zst or .csv> [--per-motif 40]
//
// The output is deterministic for a given database file, so re-running only changes it when Lichess does.
import { writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { puzzleRows } from './lichess-csv.mjs'

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

for await (const row of puzzleRows(input)) {
  rows++
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
