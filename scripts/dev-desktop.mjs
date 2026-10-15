// Runs the Vite dev server and Electron together (npm run dev:desktop).
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PORT = 5173
const DEV_URL = `http://localhost:${PORT}`
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(cmd, args, extraEnv = {}) {
  return spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...extraEnv } })
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Vite dev server did not start on ${url}`)
}

const main = run(npx, ['esbuild', 'electron/main.ts', '--bundle', '--platform=node', '--format=cjs', '--target=node22', '--external:electron', '--outfile=dist-electron/main.cjs'])
await new Promise((resolve, reject) => main.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('main build failed')))))

const vite = run(npx, ['vite', '--port', String(PORT), '--strictPort'])
try {
  await waitForServer(DEV_URL)
} catch (e) {
  console.error(e.message)
  vite.kill()
  process.exit(1)
}

const electronPath = require('electron')
// Some terminals (for example ones started by Electron-based tools) export
// ELECTRON_RUN_AS_NODE, which would make Electron run as plain Node. Strip it.
const env = { ...process.env, VITE_DEV_SERVER_URL: DEV_URL }
delete env.ELECTRON_RUN_AS_NODE
const electron = spawn(electronPath, ['.'], { stdio: 'inherit', env })
electron.on('exit', () => {
  vite.kill()
  process.exit(0)
})
process.on('SIGINT', () => {
  electron.kill()
  vite.kill()
  process.exit(0)
})
