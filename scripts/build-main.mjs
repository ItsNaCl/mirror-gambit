// Bundles the Electron main process and preload script into dist-electron/*.cjs.
// Everything (including electron-updater) is bundled, because the package ships without node_modules.
import { build } from 'esbuild'

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: false, logLevel: 'info' }
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' })
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' })
