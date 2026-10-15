// Bundles the Electron main process (electron/main.ts) into dist-electron/main.cjs.
import { build } from 'esbuild'

await build({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist-electron/main.cjs',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
})
