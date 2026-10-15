// Evaluates the final position of every opening line with Stockfish at depth 18
// and flags lines where the side the opening is for ends up worse than -0.7.
// Usage: npm run openings:check   (writes scripts/opening-eval-report.md)
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { startEngine } from './engine-node.mjs'
import { allLines, openings } from '../src/openings/index.ts'

const DEPTH = Number(process.env.DEPTH ?? 18)
const THRESHOLD_CP = -70
const here = dirname(fileURLToPath(import.meta.url))

const engine = startEngine({ threads: Math.max(1, Math.min(8, (await import('node:os')).cpus().length - 1)), hash: 256 })
await engine.ready

const rows = []
let flagged = 0
for (const opening of openings) {
  for (const line of allLines(opening)) {
    const chess = new Chess()
    let illegal = null
    for (const m of line.moves) {
      try {
        chess.move(m.san)
      } catch {
        illegal = m.san
        break
      }
    }
    if (illegal) {
      rows.push({ opening: opening.name, line: line.name, isTrap: line.isTrap, eval: 'ILLEGAL ' + illegal, flag: true })
      flagged++
      continue
    }
    const r = await engine.evaluate(chess.fen(), DEPTH)
    const toWhite = chess.turn() === 'w' ? 1 : -1
    const toSide = opening.side === 'white' ? 1 : -1
    let cpForSide
    let text
    if (r.mate != null) {
      const m = r.mate * toWhite * toSide
      cpForSide = m > 0 ? 100000 : -100000
      text = m > 0 ? `mate in ${m}` : `mated in ${-m}`
    } else {
      cpForSide = r.cp * toWhite * toSide
      text = (cpForSide / 100).toFixed(2)
    }
    const flag = !line.isTrap && cpForSide < THRESHOLD_CP
    if (flag) flagged++
    rows.push({ opening: opening.name, line: line.name, isTrap: line.isTrap, eval: text, flag })
    process.stdout.write(`${flag ? 'FLAG ' : '  ok '} ${text.padStart(10)}  ${opening.name} / ${line.name}\n`)
  }
}
engine.quit()

const md = [
  `# Opening line evaluation report`,
  ``,
  `Generated ${new Date().toISOString().slice(0, 10)} with Stockfish 19 at depth ${DEPTH}.`,
  `Scores are from the point of view of the side the opening is for (positive = good for that side).`,
  `Main lines and sidelines are flagged when the score is below ${THRESHOLD_CP / 100}.`,
  `Trap lines are shown for information only: their final positions are lopsided on purpose.`,
  ``,
  `| Opening | Line | Score for our side | Status |`,
  `|---|---|---|---|`,
  ...rows.map((r) => `| ${r.opening} | ${r.line} | ${r.eval} | ${r.flag ? '**FLAGGED, please review**' : r.isTrap ? 'trap (info)' : 'ok'} |`),
  ``,
  `${flagged} line(s) flagged.`,
  ``,
].join('\n')
writeFileSync(join(here, 'opening-eval-report.md'), md)
console.log(`\n${flagged} line(s) flagged. Report written to scripts/opening-eval-report.md`)
process.exit(flagged ? 1 : 0)
