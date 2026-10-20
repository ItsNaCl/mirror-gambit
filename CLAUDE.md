# Mirror Gambit

Local chess study app for beginners: React 19 + Vite + TypeScript, Stockfish 19 (WASM, Web Worker), chess.js, react-chessboard. Ships as a web app and as a Windows Electron app (MSI + portable exe). No backend; all user data lives in `localStorage`.

## Commands

```bash
npm install             # also copies Stockfish into public/stockfish/ (postinstall)
npm run dev             # Vite dev server, http://localhost:5173
npm test                # Vitest, all src/**/*.test.ts
npm run lint            # oxlint (existing warnings are known; do not add errors)
npx tsc -b              # type-check (npm run build does this too)
npm run build           # tsc -b && vite build -> dist/
npm run dev:desktop     # Electron + Vite dev server
npm run build:desktop   # dist/ + dist-electron/ + release/*.msi and portable exe
```

Before finishing a change: `npm test`, `npx tsc -b` and `npm run lint` must pass with no new errors.

## Layout

- `src/App.tsx`: the whole shell. One board shared by every mode; `Workspace` decides which mode drives it (setup, SRS cards, puzzles, opening trainer, play vs computer, or free play) and picks that mode's `interactive`, `onMove`, `arrows`, `orientation`.
- `src/hooks/`: one hook per mode (`useTrainer`, `usePuzzles`, `useSrs`, `usePlay`, `useReview`, `useTips`) plus `useGame` (board state), `useEngine` (context), `useSettings` (context), `useAttempt` (shared tries/hints).
- `src/lib/`: pure logic with tests next to it. Keep React out of `lib/`.
- `src/components/`: one panel per tab, plus `Board`, `MoveList`, `HintBar`, `Modal`, `Toast`.
- `src/openings/*.ts`: opening content, one file per opening, validated by `openings.test.ts`.
- `src/data/puzzles/*.json`: puzzle sets (Chess Rocket format: `fen`, `solution_moves` in UCI, optional `solution_san`, `motif`, `explanation`). `from-games.json` exists but is not loaded.
- `scripts/`: Node scripts. `engine-node.mjs` drives Stockfish from Node (`evaluate`, `analyse` with MultiPV); `extend-puzzles.mjs` lengthens puzzle solutions; `check-openings.mjs` evaluates opening lines.
- `electron/main.ts`: desktop shell (`app://` scheme with COOP/COEP headers, strict CSP, sandbox).

## Conventions

- Game state is immutable: `GameState = { startFen, moves, ply }` (`src/lib/chess/game.ts`). Use `playMove`/`playUci`/`playSan`, which return a new state or `null` if the move is illegal. `ply` is a cursor, and moves after it are kept for redo.
- Moves are UCI internally (`e2e4`, `e7e8q`) and SAN for display. Engine scores are always from **White's** point of view (`Score`, `scoreToCp`, `scoreFor`).
- Only one mode drives the board at a time. When adding a mode, make it exit the others in `App.tsx` (see the `trainer`/`puzzles`/`srs`/`play` wrappers) and silence `useTips` while it is active.
- Practice exercises (puzzles, drills, cards) share `useAttempt` + `HintBar`: unlimited tries, 4 hint levels, Clean/Assisted/Failed scoring (`src/lib/practice/practice.ts`).
- Move quality always goes through `classifyMove` (`src/lib/analysis/classify.ts`), the six-level beginner scale. Don't invent new thresholds.
- localStorage keys are `mirror-gambit.<thing>.v<n>`. Wrap reads and writes in try/catch and normalise old shapes instead of discarding them.
- UI copy is plain language for beginners: short sentences, no jargon without a `Glossary` definition, no em dashes.
- Comments explain *why*. Match the existing density, and add no comments that restate the code.

## Engine gotchas

- `StockfishEngine` runs **one search at a time**. A new `analyze()` replaces any pending request, and a replaced `evaluate()` promise never settles. So:
  - Anything that calls `engine.evaluate()` must first call `setLiveSuspended(true, '<owner>')`, so live analysis stops queuing searches, and call `setLiveSuspended(false, '<owner>')` when done. Suspension is per owner (review, play, puzzles), so modes don't release each other's suspension.
  - Await evaluations one after another and never in parallel.
- `evaluate()` reuses the FEN-keyed cache when the cached depth and MultiPV are high enough.
- Multi-threaded Stockfish needs cross-origin isolation (COOP/COEP). Vite dev and preview send the headers, and Electron serves them from `app://`. Without them the app falls back to the single-threaded build.

## Data and licensing

- Puzzle JSON and parts of the pedagogy come from Chess Rocket (GPL-3.0). Keep the README credits intact when touching them.
- Opening names: Lichess chess-openings (CC0), rebuilt with `npm run openings:data`.
- Puzzle validation runs at load time (`loadPuzzles`): invalid puzzles are dropped and logged, never shown. `puzzles.test.ts` replays every solution.

## Desktop build

- `npm run build:desktop` writes to `release/` (gitignored). Bump `version` in `package.json` for a new MSI, and never change `appId` or the MSI `upgradeCode` in `electron-builder.yml`, because upgrades in place depend on them.
- Windows paths: the repo must live at a short path. Cloning under a deep folder fails with `'$GIT_DIR' too big`.
