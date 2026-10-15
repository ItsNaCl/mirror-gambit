import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Converts the Lichess chess-openings TSV files (CC0) into one compact JSON file
// bundled with the app: an array of [eco, name, moves] where moves is a
// space-separated list of SAN moves without move numbers.
const here = dirname(fileURLToPath(import.meta.url))
const rows = []
for (const letter of ['a', 'b', 'c', 'd', 'e']) {
  const text = readFileSync(join(here, `openings-${letter}.tsv`), 'utf8')
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue
    const [eco, name, pgn] = line.split('\t')
    const moves = pgn
      .trim()
      .split(/\s+/)
      .filter((tok) => !/^\d+\.$/.test(tok))
      .join(' ')
    rows.push([eco, name, moves])
  }
}
const out = join(here, '..', 'src', 'data', 'lichess-openings.json')
writeFileSync(out, JSON.stringify(rows))
console.log(`wrote ${rows.length} openings to ${out}`)
