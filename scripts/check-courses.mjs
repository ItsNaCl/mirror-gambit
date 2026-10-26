// Checks every course against Stockfish: positions are legal, each solution move is the engine's
// choice (or within a small margin of it), the replies are the engine's best, and every stated
// verdict ("White wins", "draw") matches the evaluation.
// Usage: npm run courses:check   (writes scripts/course-check-report.md, exits 1 on any problem)
import { writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { Chess } from 'chess.js'
import { startEngine } from './engine-node.mjs'
import { courses } from '../src/courses/index.ts'

const DEPTH = Number(process.env.DEPTH ?? 20)
const MARGIN_CP = 30
const WIN_CP = 250
const DRAW_CP = 60

const engine = startEngine({ threads: Math.max(1, Math.min(8, cpus().length - 1)), hash: 256 })
await engine.ready

/** Score from White's point of view in centipawns (mates far beyond). */
function whiteCp(line, turn) {
  const sign = turn === 'w' ? 1 : -1
  if (line.mate !== null) return sign * (line.mate > 0 ? 100000 - line.mate : -100000 - line.mate)
  return sign * line.cp
}
/** White-side evaluation of a move: from the MultiPV lines, or by analysing the position after it. */
async function moveCp(fen, uci, lines, turn) {
  const known = lines.find((l) => l.pv[0] === uci)
  if (known) return whiteCp(known, turn)
  const probe = new Chess(fen)
  probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  if (probe.isCheckmate()) return turn === 'w' ? 100000 : -100000
  if (probe.isGameOver()) return 0
  const after = await engine.analyse(probe.fen(), DEPTH, 1)
  return whiteCp(after.lines[0], probe.turn())
}

const show = (cp) => (Math.abs(cp) > 50000 ? (cp > 0 ? 'mate for White' : 'mate for Black') : (cp / 100).toFixed(2))

async function checkVerdict(fen, verdict) {
  if (!verdict) return null
  const chess = new Chess(fen)
  if (chess.isGameOver()) return null
  const a = await engine.analyse(fen, DEPTH, 1)
  const cp = whiteCp(a.lines[0], chess.turn())
  if (verdict.result === 'draw' && Math.abs(cp) > DRAW_CP) return `said draw, engine ${show(cp)}`
  if (verdict.result === 'win') {
    const ok = verdict.side === 'w' ? cp >= WIN_CP : cp <= -WIN_CP
    if (!ok) return `said ${verdict.side === 'w' ? 'White' : 'Black'} wins, engine ${show(cp)}`
  }
  return null
}

const problems = []
const report = []
for (const course of courses) {
  for (const lesson of course.lessons) {
    for (const [i, step] of lesson.steps.entries()) {
      const where = `${course.id}/${lesson.id} step ${i + 1}`
      let chess
      try {
        chess = new Chess(step.fen)
      } catch (e) {
        problems.push(`${where}: illegal FEN (${e.message})`)
        continue
      }
      const v = await checkVerdict(step.fen, step.verdict)
      if (v) problems.push(`${where}: ${v}`)
      if (step.kind !== 'task') {
        report.push(`- ${where} (read) ${step.verdict ? 'verdict ok' : ''}`)
        continue
      }
      // Walk the solution: student moves must be near the engine's best, replies must be its best.
      for (const [k, uci] of step.solution.entries()) {
        const fen = chess.fen()
        const a = await engine.analyse(fen, DEPTH, 3)
        const turn = chess.turn()
        const best = a.lines[0]
        const bestCp = whiteCp(best, turn)
        const mine = a.lines.find((l) => l.pv[0] === uci)
        const sideSign = turn === 'w' ? 1 : -1
        const top = a.lines.map((l) => `${l.pv[0]} ${show(whiteCp(l, turn))}`).join(', ')
        if (k % 2 === 0) {
          // In quiet positions several moves are equal, so the test is "about as good as the best",
          // not "in the top three".
          const cp = await moveCp(fen, uci, a.lines, turn)
          if (sideSign * (bestCp - cp) > MARGIN_CP) problems.push(`${where}: move ${k + 1} ${uci} (${show(cp)}) is worse than the engine's choices (${top})`)
          for (const alt of k === 0 ? (step.accept ?? []) : []) {
            const altCp = await moveCp(fen, alt, a.lines, turn)
            if (sideSign * (bestCp - altCp) > MARGIN_CP) problems.push(`${where}: accepted ${alt} (${show(altCp)}) is not as good (${top})`)
          }
        } else if (best.pv[0] !== uci) {
          // A reply outside the top three can still be as good (in a dead draw every move is 0.00):
          // judge it by the evaluation of the position it leads to.
          let replyCp = mine ? whiteCp(mine, turn) : null
          if (replyCp === null) {
            const probe = new Chess(fen)
            probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
            if (!probe.isGameOver()) {
              const after = await engine.analyse(probe.fen(), DEPTH, 1)
              replyCp = whiteCp(after.lines[0], probe.turn())
            }
          }
          if (replyCp === null || sideSign * (bestCp - replyCp) > MARGIN_CP) problems.push(`${where}: reply ${uci} is not the engine's best (${top})`)
        }
        report.push(`- ${where} move ${k + 1} ${uci}: engine ${top}`)
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
        } catch {
          problems.push(`${where}: ${uci} is illegal`)
          break
        }
      }
    }
  }
}

engine.quit?.()
writeFileSync(new URL('./course-check-report.md', import.meta.url), `# Course check (depth ${DEPTH})\n\n${problems.length ? `## Problems\n\n${problems.map((p) => `- ${p}`).join('\n')}\n\n` : 'No problems.\n\n'}## Every move\n\n${report.join('\n')}\n`)
for (const p of problems) console.log('PROBLEM', p)
console.log(`${problems.length} problem(s). Report: scripts/course-check-report.md`)
process.exit(problems.length ? 1 : 0)
