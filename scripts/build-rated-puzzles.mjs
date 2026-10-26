// Builds the rated puzzle pool from the Lichess puzzle database (CC0) and writes
// src/data/puzzles/rated.json.
//
//   1. Download https://database.lichess.org/lichess_db_puzzle.csv.zst (about 300 MB, keep it out of the repo)
//   2. node scripts/build-rated-puzzles.mjs <path to lichess_db_puzzle.csv.zst or .csv> [--per-band 120]
//
// Puzzles are spread evenly over 100-point rating bands from 500 to 2800, and inside each band over
// the main themes, preferring well-tested puzzles (many plays, high popularity, settled rating).
// Each entry is compact: [lichess id, FEN after the opponent's move, solution in UCI, rating, themes].
// The output is deterministic for a given database file.
import { writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { puzzleRows } from './lichess-csv.mjs'

const OUT = new URL('../src/data/puzzles/rated.json', import.meta.url)
const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('--'))
const perBandArg = args.indexOf('--per-band')
const PER_BAND = perBandArg >= 0 ? Number(args[perBandArg + 1]) : 120
if (!input) {
  console.error('usage: node scripts/build-rated-puzzles.mjs <lichess_db_puzzle.csv.zst> [--per-band 120]')
  process.exit(1)
}

const MIN_RATING = 500
const MAX_RATING = 2800
const BAND = 100
const MIN_POPULARITY = 85
const MIN_PLAYS = 300
const MAX_RATING_DEVIATION = 85
const MAX_MOVES = 12

// The theme a puzzle is filed under (first match wins); the app's theme filter uses the same keys.
const GROUPS = [
  ['mate', ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'mate', 'backRankMate', 'smotheredMate']],
  ['fork', ['fork']],
  ['pin', ['pin', 'skewer', 'xRayAttack']],
  ['discovered', ['discoveredAttack', 'doubleCheck']],
  ['hanging', ['hangingPiece', 'trappedPiece', 'capturingDefender']],
  ['sacrifice', ['sacrifice', 'deflection', 'attraction', 'clearance', 'interference']],
  ['endgame', ['endgame', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'promotion']],
  ['defence', ['defensiveMove', 'quietMove', 'zugzwang', 'intermezzo']],
]
// Themes kept in the file: the groups above plus a few that make good hints.
const KEEP = new Set([...GROUPS.flatMap(([, t]) => t), 'short', 'long', 'veryLong', 'crushing', 'advantage', 'opening', 'middlegame'])

function groupOf(themes) {
  for (const [g, list] of GROUPS) if (list.some((t) => themes.has(t))) return g
  return null
}

const bands = new Map() // band start -> Map(group -> candidates[])
let rows = 0
for await (const row of puzzleRows(input)) {
  rows++
  const rating = Number(row.Rating)
  if (rating < MIN_RATING || rating >= MAX_RATING) continue
  if (Number(row.Popularity) < MIN_POPULARITY || Number(row.NbPlays) < MIN_PLAYS) continue
  if (Number(row.RatingDeviation) > MAX_RATING_DEVIATION) continue
  const moves = row.Moves.split(' ')
  if (moves.length < 2 || moves.length > MAX_MOVES) continue
  const themes = new Set(row.Themes.split(' '))
  const group = groupOf(themes)
  if (!group) continue
  const band = Math.floor(rating / BAND) * BAND
  const byGroup = bands.get(band) ?? new Map()
  const list = byGroup.get(group) ?? []
  list.push({ id: row.PuzzleId, fen: row.FEN, moves, rating, plays: Number(row.NbPlays), themes })
  byGroup.set(group, list)
  bands.set(band, byGroup)
}

const byPlays = (a, b) => b.plays - a.plays || (a.id < b.id ? -1 : 1)
const picked = []
for (const band of [...bands.keys()].sort((a, b) => a - b)) {
  const byGroup = bands.get(band)
  for (const list of byGroup.values()) list.sort(byPlays)
  // Round-robin over the themes, most played first, until the band is full.
  const queues = GROUPS.map(([g]) => byGroup.get(g) ?? []).filter((q) => q.length)
  const chosen = []
  for (let i = 0; chosen.length < PER_BAND && queues.some((q) => q.length > i); i++)
    for (const q of queues) if (q[i] && chosen.length < PER_BAND) chosen.push(q[i])
  picked.push(...chosen)
  console.log(`${band}-${band + BAND - 1}: ${chosen.length} picked`)
}

const out = []
for (const p of picked.sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1))) {
  const chess = new Chess(p.fen)
  // Lichess positions start one move early: play the opponent's move to reach the puzzle.
  chess.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] })
  const fen = chess.fen()
  const solution = p.moves.slice(1)
  // Every solution move must be legal from the puzzle position.
  for (const uci of solution) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  out.push([p.id, fen, solution.join(' '), p.rating, [...p.themes].filter((t) => KEEP.has(t)).join(' ')])
}

writeFileSync(OUT, '[\n' + out.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n')
console.log(`read ${rows} puzzles, wrote ${out.length} to ${OUT.pathname}`)
