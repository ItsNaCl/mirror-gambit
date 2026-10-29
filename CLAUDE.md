# Mirror Gambit

Local chess study app for beginners: React 19 + Vite + TypeScript, Stockfish 19 (WASM, Web Worker), chess.js, react-chessboard. Ships as a web app and as a Windows Electron app (NSIS installer + portable exe). No backend; user data lives in IndexedDB (`src/lib/store/kv.ts`), with the 1.x `localStorage` keys mirrored so older versions still read them.

## Commands

```bash
npm install             # also copies Stockfish into public/stockfish/ (postinstall)
npm run dev             # Vite dev server, http://localhost:5173
npm test                # Vitest, all src/**/*.test.ts
npm run lint            # oxlint (existing warnings are known; do not add errors)
npx tsc -b              # type-check (npm run build does this too)
npm run build           # tsc -b && vite build -> dist/
npm run dev:desktop     # Electron + Vite dev server
npm run build:desktop   # dist/ + dist-electron/ + release/ Setup.exe and portable exe (no publish)
npm run backup          # copy %APPDATA%\Mirror Gambit into backups/<date> (gitignored; close the app first)
```

Before finishing a change: `npm test`, `npx tsc -b` and `npm run lint` must pass with no new errors.

## Layout

- `src/App.tsx`: the shell. Each mode has its own `useGame` (free board, play, trainer, puzzles, cards), so one mode never overwrites another's game. The route decides which mode owns the board (`sessionFor` in `src/sessions/sessions.ts`), and that mode's `BoardSession` supplies `interactive`, `onMove`, `arrows`, `orientation` and whether the move list may be browsed. The engine follows the board on screen. Reviewing a game from another mode copies it onto the free board first.
- `src/lib/games/`: My games. `sources.ts` parses Lichess NDJSON and chess.com archives into `LibraryGame`s; `profile.ts` tags each of the student's mistakes (phase, and reasons from the coach) and builds the weakness profile. `src/hooks/useLibrary.ts` imports, stores and batch-reviews them (only while the My games route is open, because the engine runs one search at a time). The main process does the fetching (`games:fetch`); chess.com needs an identifying User-Agent.
- `src/lib/repertoire/repertoire.ts`: repertoires keyed by position (`posKey`, FEN without move counters, so transpositions match). One move per position for the owner's side, each with SM-2 state from `lib/srs`; `pickDrillLine`, `findGaps`, `opponentReplies` (from My games). Built-in openings import with `onConflict: 'skip'` and without trap lines, because some sidelines are another choice for the student's side. `src/hooks/useRepertoire.ts` runs Build, Drill and Gaps on its own game.
- Rated puzzles: `src/data/puzzles/rated.json` (compact `[id, fen, uci solution, rating, themes]`, built by `scripts/build-rated-puzzles.mjs` from the Lichess CSV, loaded lazily), `src/lib/puzzles/rated.ts` (picking and the Elo rating) and `src/hooks/useRatedPuzzles.ts`, which plays them through `usePuzzles.startRated`. Both Lichess scripts read the CSV through `scripts/lichess-csv.mjs`.
- Courses: `src/courses/*.ts` (read and task steps, see `types.ts`), played by `src/hooks/useCourse.ts`. After editing a course run `npm run courses:check`: it fails if a solution is not near Stockfish's best or a win/draw verdict is wrong. Positions with 7 pieces or fewer are judged by the Lichess tablebase (network), because Stockfish without tablebases misjudges fortresses such as the wrong rook pawn.
- `src/app/`: `routes.ts` (hash routes and the sidebar groups) and `Shell.tsx` (sidebar, top bar). `src/components/CommandPalette.tsx` is the Ctrl+K palette.
- `src/hooks/`: one hook per mode (`useTrainer`, `usePuzzles`, `useSrs`, `usePlay`, `useReview`, `useTips`) plus `useGame` (board state), `useEngine` (context), `useSettings` (context), `useAttempt` (shared tries/hints).
- `src/lib/`: pure logic with tests next to it. Keep React out of `lib/`.
- `src/components/`: one panel per tab, plus `Board`, `MoveList`, `HintBar`, `Modal`, `Toast`.
- `src/openings/*.ts`: opening content, one file per opening, validated by `openings.test.ts`.
- `src/data/puzzles/*.json`: puzzle sets (Chess Rocket format: `fen`, `solution_moves` in UCI, optional `solution_san`, `motif`, `explanation`). `from-games.json` exists but is not loaded.
- `scripts/`: Node scripts. `engine-node.mjs` drives Stockfish from Node (`evaluate`, `analyse` with MultiPV); `extend-puzzles.mjs` lengthens puzzle solutions; `check-openings.mjs` evaluates opening lines.
- `electron/main.ts`: desktop shell (`app://` scheme with COOP/COEP headers, strict CSP, sandbox). `electron/preload.ts` exposes `window.mirrorGambit` (typed in `src/lib/desktop.ts`): update controls from `electron/updater.ts`, a chess.com game fetch, and the Claude coach from `electron/coach.ts` (the API key is encrypted with `safeStorage` and never reaches the page). Keep that surface minimal and validate every IPC argument in the main process.
- Web app (phones): `public/manifest.webmanifest`, `src/pwa/sw.js` (the service worker; `vite.config.ts` fills in the precache list and version and writes `dist/sw.js` and `dist/version.json`) and `src/lib/pwa.ts` (registration, updates, install prompt; never runs in the desktop app or dev). The worker serves the app shell from its cache, caches the full engine on first use and adds the COOP/COEP headers that GitHub Pages cannot send. `.github/workflows/pages.yml` publishes it to https://itsnacl.github.io/mirror-gambit/ on each push to main, built with `BASE_PATH=/mirror-gambit/`. Touch devices default to the lite engine.
- The coach (v3): `src/lib/coach/curriculum.ts` (rating bands, weekly splits, habits, exit criteria), `metrics.ts` (diagnostics from the last 20 analysed games: pieces hung per game, repeat mistakes, the phase lost games turn in, share of slow games, the rating from the newest rapid game), `planner.ts` (deterministic: builds today's blocks from the band's weekly targets minus what the session log says was done this week, cards first, then unreviewed games, then a slow game only in a 45+ minute session, then study by deficit). `src/hooks/useCoach.ts` keeps the log (`mirror-gambit.sessions.v1`) and the session in progress (`mirror-gambit.coach-session.v1`); `src/components/CoachHome.tsx` is the default route. `App.openBlock` starts each block's activity on its own screen. Settings `weeklyHours`, `ratingOverride`, `coachVoice` feed it. `LibraryGame.userRating` comes from the import and is what the band is chosen from.
- `src/lib/coach/`: pure coaching logic. `coach.ts` is the review coach (walks engine lines for forks, free pieces, mates); `features.ts` reads a position from the board alone (loose pieces, pins, pawns, king cover, outposts, square control); `explain.ts` turns a move plus the engine's best move and reply into reasons and feeds both the live alerts and the review coach; `claudeContext.ts` writes a position as text for Claude; `usage.ts` prices Claude answers. `src/components/CoachPanel.tsx` drives the review coach and shows lines on the board through a `BoardPreview` held in `App.tsx`; `BoardOverlay.tsx` draws the board layers.

## Conventions

- Game state is immutable: `GameState = { startFen, moves, ply }` (`src/lib/chess/game.ts`). Use `playMove`/`playUci`/`playSan`, which return a new state or `null` if the move is illegal. `ply` is a cursor, and moves after it are kept for redo.
- Moves are UCI internally (`e2e4`, `e7e8q`) and SAN for display. Engine scores are always from **White's** point of view (`Score`, `scoreToCp`, `scoreFor`).
- When adding a mode: give it its own `useGame` in `App`, a route in `routes.ts`, a session builder in `sessions.ts`, and a case in `sessionFor`. Tips only run for the free board.
- Practice exercises (puzzles, drills, cards) share `useAttempt` + `HintBar`: unlimited tries, 4 hint levels, Clean/Assisted/Failed scoring (`src/lib/practice/practice.ts`).
- Move quality always goes through `classifyMove` (`src/lib/analysis/classify.ts`), the six-level beginner scale. Don't invent new thresholds.
- Stored keys are `mirror-gambit.<thing>.v<n>`, read and written through `src/lib/store/kv.ts` (synchronous reads from a cache filled before the first render). Normalise old shapes instead of discarding them.
- Design: `src/styles.css` tokens (zinc ground, flat surfaces separated by tone, colour only on the board and on data, Inter for text and JetBrains Mono only for SAN/FEN). Icons come from `lucide-react`; no emoji in the UI. Board colours live in `src/lib/ui/boardColors.ts`.
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

## Desktop build and releases

- The installer is NSIS, because electron-updater cannot update an MSI. Never change `appId`, `productName` or the `publish` block in `electron-builder.yml`: installed copies find updates and their data folder through them.
- Release = bump `version` in `package.json`, commit to `main`, push tag `v<version>`. `.github/workflows/release.yml` checks the tag matches, runs tests and lint, and publishes the installer, portable exe and `latest.yml` to GitHub Releases.
- The repo is public (GPL-3.0). Never commit secrets, personal emails or local paths. Commits use `NaCl <22365495+ItsNaCl@users.noreply.github.com>`. Merge locally and push instead of merging on GitHub, so no merge commit picks up an account email.
- Windows paths: the repo must live at a short path. Cloning under a deep folder fails with `'$GIT_DIR' too big`.
