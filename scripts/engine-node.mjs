import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Minimal UCI driver around the stockfish npm package running in Node.
 * Used by scripts/check-openings.mjs to evaluate opening lines.
 */
export function startEngine({ threads = 4, hash = 128, multiThreaded = true } = {}) {
  const file = multiThreaded ? 'stockfish/bin/stockfish-19.js' : 'stockfish/bin/stockfish-19-single.js'
  const path = require.resolve(file)
  const proc = spawn(process.execPath, [path], { stdio: ['pipe', 'pipe', 'inherit'] })
  const listeners = new Set()
  let buffer = ''
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) for (const l of listeners) l(line.trim())
  })
  const send = (cmd) => proc.stdin.write(cmd + '\n')
  const waitFor = (predicate) =>
    new Promise((resolve) => {
      const collected = []
      const l = (line) => {
        collected.push(line)
        if (predicate(line)) {
          listeners.delete(l)
          resolve(collected)
        }
      }
      listeners.add(l)
    })

  const ready = (async () => {
    send('uci')
    await waitFor((l) => l === 'uciok')
    send(`setoption name Threads value ${threads}`)
    send(`setoption name Hash value ${hash}`)
    send('isready')
    await waitFor((l) => l === 'readyok')
  })()

  return {
    ready,
    /** Evaluate a position. Returns { cp, mate, bestmove, depth } from the side to move's perspective. */
    async evaluate(fen, depth) {
      await ready
      send('ucinewgame')
      send(`position fen ${fen}`)
      const p = waitFor((l) => l.startsWith('bestmove'))
      send(`go depth ${depth}`)
      const lines = await p
      let last = null
      for (const line of lines) {
        if (!line.startsWith('info') || !line.includes(' score ') || line.includes('bound')) continue
        const m = /depth (\d+).*score (cp|mate) (-?\d+)/.exec(line)
        if (!m) continue
        last = { depth: Number(m[1]), cp: m[2] === 'cp' ? Number(m[3]) : null, mate: m[2] === 'mate' ? Number(m[3]) : null }
      }
      const bm = /bestmove (\S+)/.exec(lines.at(-1))
      return { ...last, bestmove: bm?.[1] }
    },
    quit() {
      send('quit')
      proc.stdin.end()
    },
  }
}
