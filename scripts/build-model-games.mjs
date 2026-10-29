// Builds the model game set for Guess the move from one month of the Lichess Elite Database
// (CC0, https://database.nikonoel.fr/) and writes src/data/model-games/games.json.
//
//   1. Download a month, for example lichess_elite_2020-10.zip, and unzip it outside the repo.
//   2. node scripts/build-model-games.mjs <path to the .pgn> [--per-bucket 10] [--depth 10]
//
// A game qualifies when both players are rated 2400 or more, it was decisive and ended normally,
// the clock gave at least five minutes, and the opening is one the student's repertoire meets:
// the Italian or the Scotch from either side, the Ruy Lopez and the Queen's Gambit Declined as
// Black. The winner is the model side. Stockfish then plays through every candidate and keeps a
// game only when the model side never lost more than MAX_LOSS_CP on a move, so every move the
// student is asked to guess is one worth finding. The per-ply evaluations are kept with the game.
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { cpus } from 'node:os'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { startEngine } from './engine-node.mjs'

const OUT = new URL('../src/data/model-games/games.json', import.meta.url)
const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith('--'))
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const PER_BUCKET = flag('--per-bucket', 10)
const DEPTH = flag('--depth', 10)
if (!input) {
  console.error('usage: node scripts/build-model-games.mjs <lichess_elite_YYYY-MM.pgn> [--per-bucket 10] [--depth 10]')
  process.exit(1)
}

const MIN_ELO = 2400
const MIN_BASE_SECONDS = 300
const MIN_PLIES = 40
const MAX_PLIES = 110
/** A model side move may lose at most this much against the engine's best. */
const MAX_LOSS_CP = 100
/** Candidates looked at per bucket before giving up on filling it. */
const CANDIDATES_PER_BUCKET = 60

/**
 * The buckets: which opening names count, and which side the student would be on. A game lands
 * in the bucket for the winner's side, so the model side is always the winner.
 */
const BUCKETS = [
  { id: 'italian-w', match: /^Italian Game/, side: 'w', label: 'Italian Game as White' },
  { id: 'italian-b', match: /^Italian Game/, side: 'b', label: 'Italian Game as Black' },
  { id: 'scotch-w', match: /^Scotch Game/, side: 'w', label: 'Scotch Game as White' },
  { id: 'scotch-b', match: /^Scotch Game/, side: 'b', label: 'Scotch Game as Black' },
  { id: 'ruy-b', match: /^Ruy Lopez/, side: 'b', label: 'Ruy Lopez as Black' },
  { id: 'qgd-b', match: /^Queen's Gambit Declined/, side: 'b', label: "Queen's Gambit Declined as Black" },
]

function bucketFor(headers) {
  const winner = headers.Result === '1-0' ? 'w' : headers.Result === '0-1' ? 'b' : null
  if (!winner) return null
  return BUCKETS.find((b) => b.side === winner && b.match.test(headers.Opening ?? '')) ?? null
}

function baseSeconds(tc) {
  const m = /^(\d+)\+(\d+)$/.exec(tc ?? '')
  return m ? Number(m[1]) + 40 * Number(m[2]) : 0
}

function qualifies(headers) {
  if (Number(headers.WhiteElo) < MIN_ELO || Number(headers.BlackElo) < MIN_ELO) return false
  if (headers.Termination !== 'Normal') return false
  if (baseSeconds(headers.TimeControl) < MIN_BASE_SECONDS) return false
  return bucketFor(headers) !== null
}

/** Strips move numbers, the result and any comments; returns the SAN tokens. */
function sansOf(moveText) {
  return moveText
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
    .map((t) => t.replace(/^\d+\.+/, ''))
}

/** Reads the PGN once and collects candidates per bucket, best clocks and ratings first. */
async function collect(path) {
  const candidates = Object.fromEntries(BUCKETS.map((b) => [b.id, []]))
  let headers = {}
  let moves = []
  let inMoves = false
  let seen = 0
  const flush = () => {
    if (inMoves && qualifies(headers)) {
      const sans = sansOf(moves.join(' '))
      if (sans.length >= MIN_PLIES && sans.length <= MAX_PLIES) {
        const bucket = bucketFor(headers)
        candidates[bucket.id].push({ headers, sans })
      }
    }
    headers = {}
    moves = []
    inMoves = false
  }
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const line of rl) {
    if (line.startsWith('[')) {
      if (inMoves) flush()
      const m = /^\[(\w+) "(.*)"\]$/.exec(line)
      if (m) headers[m[1]] = m[2]
    } else if (line.trim()) {
      inMoves = true
      moves.push(line)
    }
    if (++seen % 2_000_000 === 0) console.error(`  ${seen} lines read`)
  }
  flush()
  for (const list of Object.values(candidates)) {
    list.sort((a, b) => baseSeconds(b.headers.TimeControl) - baseSeconds(a.headers.TimeControl) || avgElo(b.headers) - avgElo(a.headers))
  }
  return candidates
}

const avgElo = (h) => (Number(h.WhiteElo) + Number(h.BlackElo)) / 2

/** White-view centipawns from the engine's side-to-move answer; mates become large numbers. */
function whiteCp(r, turn) {
  const sign = turn === 'w' ? 1 : -1
  if (r.mate != null) return sign * (r.mate > 0 ? 10000 - Math.abs(r.mate) : -10000 + Math.abs(r.mate))
  return sign * r.cp
}

/** Plays the game through, evaluating every position. Returns null when a move is illegal or the model side slipped. */
async function judge(engine, sans, side) {
  const chess = new Chess()
  const evals = [whiteCp(await engine.evaluate(chess.fen(), DEPTH), 'w')]
  let worst = 0
  for (let i = 0; i < sans.length; i++) {
    const mover = chess.turn()
    try {
      chess.move(sans[i])
    } catch {
      return null
    }
    if (chess.isGameOver()) {
      evals.push(chess.isCheckmate() ? (mover === 'w' ? 10000 : -10000) : 0)
      break
    }
    evals.push(whiteCp(await engine.evaluate(chess.fen(), DEPTH), chess.turn()))
    if (mover === side) {
      const before = side === 'w' ? evals[i] : -evals[i]
      const after = side === 'w' ? evals[i + 1] : -evals[i + 1]
      const loss = Math.max(0, before - after)
      worst = Math.max(worst, loss)
      if (loss > MAX_LOSS_CP) return null
    }
  }
  return { evals, worst }
}

console.error(`Reading ${input}`)
const candidates = await collect(input)
for (const b of BUCKETS) console.error(`  ${b.id}: ${candidates[b.id].length} candidates`)

const engine = startEngine({ threads: Math.max(1, Math.min(8, cpus().length - 1)), hash: 256 })
await engine.ready

const games = []
for (const b of BUCKETS) {
  let kept = 0
  let looked = 0
  for (const c of candidates[b.id]) {
    if (kept >= PER_BUCKET || looked >= CANDIDATES_PER_BUCKET) break
    looked++
    const judged = await judge(engine, c.sans, b.side)
    if (!judged) continue
    kept++
    const h = c.headers
    games.push({
      id: (h.LichessURL ?? '').split('/').pop() || `${b.id}-${kept}`,
      url: h.LichessURL ?? '',
      white: h.White,
      black: h.Black,
      whiteElo: Number(h.WhiteElo),
      blackElo: Number(h.BlackElo),
      date: (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-'),
      eco: h.ECO ?? '',
      opening: h.Opening ?? '',
      timeControl: h.TimeControl ?? '',
      result: h.Result,
      side: b.side,
      bucket: b.id,
      sans: c.sans.join(' '),
      evals: judged.evals,
    })
    console.error(`  ${b.id}: kept ${kept} (${h.White} vs ${h.Black}, ${h.TimeControl}, worst slip ${judged.worst} cp)`)
  }
  console.error(`${b.id}: ${kept} of ${looked} candidates kept`)
}
engine.quit?.()

mkdirSync(dirname(fileURLToPath(OUT)), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: 'Lichess Elite Database (CC0), https://database.nikonoel.fr/',
      built: new Date().toISOString().slice(0, 10),
      depth: DEPTH,
      buckets: BUCKETS.map(({ id, side, label }) => ({ id, side, label })),
      games,
    },
    null,
    0,
  ) + '\n',
)
console.error(`Wrote ${games.length} games to ${fileURLToPath(OUT)}`)
process.exit(0)
