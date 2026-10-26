// Copies the desktop app's data folder (%APPDATA%\Mirror Gambit) into backups/<date time>/.
// backups/ is gitignored: it holds personal data and the repo is public.
// Close the app first; Chromium keeps its databases locked while it runs.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = join(process.env.APPDATA ?? '', 'Mirror Gambit')
if (!process.env.APPDATA || !existsSync(source)) {
  console.error(`No app data found at ${source}`)
  process.exit(1)
}

// Caches are rebuilt on start; leaving them out keeps a backup small.
const skip = (name) => /cache$/i.test(name) || name === 'DevToolsActivePort'

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`
const target = resolve('backups', stamp)
mkdirSync(target, { recursive: true })

const failed = []
for (const name of readdirSync(source)) {
  if (skip(name)) continue
  try {
    cpSync(join(source, name), join(target, name), { recursive: true })
  } catch (err) {
    failed.push(`${name}: ${err.code ?? err.message}`)
  }
}

console.log(`Backed up to ${target}`)
if (failed.length) {
  console.warn(`Could not copy (is the app still open?):\n  ${failed.join('\n  ')}`)
  process.exit(2)
}
