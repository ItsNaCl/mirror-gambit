/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const stockfish = JSON.parse(readFileSync('node_modules/stockfish/package.json', 'utf8')) as { version: string }

// COOP/COEP headers make the page "cross-origin isolated", which is what
// unlocks SharedArrayBuffer and therefore the multi-threaded Stockfish build.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

/**
 * Writes dist/sw.js (from src/pwa/sw.js) with the list of files the installed web app keeps for
 * offline use, and dist/version.json. Left out: the 95 MB full engines (cached on first use)
 * and .woff fonts (every browser that runs the app loads the .woff2 ones).
 */
function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'mirror-gambit-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else files.push(relative(outDir, full).split('\\').join('/'))
        }
      }
      walk(outDir)
      const fullEngine = /^stockfish\/stockfish-19(-single)?\.wasm$/
      const precache = files
        .filter((f) => !fullEngine.test(f) && !f.endsWith('.woff') && f !== 'sw.js' && f !== 'version.json')
        .sort()
      const hash = createHash('sha256')
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)))
      const build = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`
      const sw = readFileSync('src/pwa/sw.js', 'utf8')
        .replace('__VERSION__', build)
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__STOCKFISH__', stockfish.version)
      writeFileSync(join(outDir, 'sw.js'), sw)
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version: pkg.version, build }))
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the web app from /mirror-gambit/ (BASE_PATH is set by the Pages workflow).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    headers: isolationHeaders,
    // Dev only: lets the browser build load chess.com game links (the desktop app fetches them in the
    // main process). Imports by username need no proxy: both sites' APIs allow browser requests.
    proxy: {
      '/chesscom': { target: 'https://www.chess.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/chesscom/, '/callback') },
    },
  },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
