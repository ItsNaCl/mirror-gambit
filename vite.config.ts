/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// COOP/COEP headers make the page "cross-origin isolated", which is what
// unlocks SharedArrayBuffer and therefore the multi-threaded Stockfish build.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: {
    headers: isolationHeaders,
    // Dev only: lets the browser build load chess.com games (the desktop app fetches them in the main process).
    proxy: { '/chesscom': { target: 'https://www.chess.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/chesscom/, '/callback') } },
  },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
