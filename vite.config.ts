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
    proxy: {
      '/chesscom': { target: 'https://www.chess.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/chesscom/, '/callback') },
      // Dev only: recent games by username for My games.
      // chess.com's public API refuses requests without an identifying User-Agent.
      '/chesscomapi': {
        target: 'https://api.chess.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/chesscomapi/, ''),
        configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('User-Agent', 'Mirror Gambit (open-source chess study app; github.com/ItsNaCl/mirror-gambit)')),
      },
      '/lichess': { target: 'https://lichess.org', changeOrigin: true, rewrite: (p) => p.replace(/^\/lichess/, '') },
    },
  },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
