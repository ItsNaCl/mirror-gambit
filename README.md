# Mirror Gambit

A local chess study app for beginners. You play both sides yourself or a full game
against the computer at six difficulty levels, with Stockfish running in the
background for analysis, blunder alerts, hints, an opening trainer
with plain-language commentary, tactical puzzles, spaced-repetition review of your
own mistakes, a full game review and a progress page.

Everything runs in your browser. There is no backend and no account, and the app
works offline once the dependencies are installed.

## Install and run

Requirements: Node.js 20 or newer (tested with Node 24) and npm.

```bash
npm install
npm run dev
```

Then open the address Vite prints (normally http://localhost:5173).

`npm install` also copies the Stockfish engine files into `public/stockfish/`
(the copy script runs again before `npm run dev` and `npm run build`, so it is safe
to delete that folder).

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally (with the headers the engine needs) |
| `npm test` | Run all unit and validation tests |
| `npm run openings:check` | Evaluate every opening line with Stockfish at depth 18 and write `scripts/opening-eval-report.md` |
| `npm run openings:data` | Rebuild `src/data/lichess-openings.json` from the Lichess TSV files in `scripts/` |
| `npm run puzzles:extend` | Lengthen short puzzles with Stockfish-verified follow-up moves (rewrites `src/data/puzzles/*.json`) |
| `npm run puzzles:lichess -- <file>` | Rebuild `src/data/puzzles/lichess-longer.json` from a downloaded `lichess_db_puzzle.csv.zst` |

## What is in the app

**Repertoire (2.3).** Build your own opening repertoire for White or Black and drill it with spaced
repetition, in the style of Chessreps. Every move you play on the board in Build is added (your side keeps
one answer per position; transpositions are recognised), or add whole lines from a built-in opening, the
game on the Board, or a pasted PGN. Drill plays the opponent's replies, weighted towards the ones your own
opponents play in your imported games, and asks for your move with the same unlimited tries and hints as
puzzles; each of your moves comes back on the same schedule as the mistake cards. Gaps lists the replies you
have no answer for, from your games and, on request, from Stockfish.


**My games (2.2).** Import your recent games from Lichess or chess.com by username (desktop app; the browser
build can import from Lichess only, because chess.com's firewall turns away the dev proxy). A quick review
(depth 12) goes through them one by one and builds your profile: where your mistakes happen (opening,
middlegame, endgame), what goes wrong most often (missed forks, pieces left hanging, walking into pins,
weakened king cover and more, each with the moves where it happened), and your score and accuracy with
each opening. Click any listed move to open that game in Game review at that moment. Games and reviews are
saved on this computer.


**The coach (2.1).** After each move the board explains it in words: what it gave away, the opponent's best
answer, and what was better ("White answers Bxc4 and wins the queen. Qa5 was the move."). *What stands out*
points at the few things a strong player would notice in the position (a loose piece, a pin, an uncastled
king, weak pawns, an outpost), read from the board alone, so it works even with analysis hidden. The game
review coach adds the same kind of reasons to each move. *Layers* under the board shades each square by
who controls it, draws pins and skewers, and rings loose pieces.

**Ask Claude (optional, desktop app).** Add your own Anthropic API key in Settings to ask Claude about any
position or move, or for a summary of a reviewed game. Claude is told the engine's lines and the board
reading, so its explanation stays tied to the analysis. Nothing is sent unless you press a coach button,
the key is stored encrypted with Windows' key store and is only sent to Anthropic, and Settings shows the
month's estimated spend with an optional monthly limit. A typical question costs about $0.02 on Claude Opus
5.5, $0.01 on Sonnet 5.5 and well under a cent on Haiku 5.5.


**Version 2.0** brings a new interface: a sidebar with every screen, a Ctrl+K command bar to jump anywhere
or run an action, and a darker, calmer design where colour is kept for the board and your move grades.
Each mode now has its own board, so starting a puzzle or a game against the computer never overwrites the
game you were analysing. Your saved data moves to IndexedDB on the first start (the old copy is kept).

**Board (left side)**

- Move pieces by dragging or by clicking a piece and then its target square.
- Legal-move dots, last-move and check highlighting, a promotion picker.
- Undo, redo, reset, flip, and an optional "auto flip each turn".
- Clickable move list; the left and right arrow keys step through the game.
- Position setup: drag pieces from the trays or paste a FEN. Illegal positions are rejected with an explanation.
- Clear game-over messages for checkmate, stalemate, repetition, the 50-move rule and insufficient material.
- PGN import and export (optionally with move classifications as comments), "Copy FEN", and "Save this position" to turn any position into a review card.

**Analysis tab**

- "Show analysis" is off by default so you think first. When on: an eval bar, the top three engine lines in SAN with score and depth, and an arrow for the best move. Scores are from White's point of view; `M3` means mate in three.
- The engine keeps running while analysis is hidden, because blunder alerts and hints need it.
- Tips (each can be switched off in Settings):
  - Move alerts after each move on a six-level beginner scale (see below), with the better move. A blunder offers a one-click "Take it back" and "Save for review".
  - Opening detection with ECO code and name from the Lichess chess-openings dataset.
  - Opening principle reminders during the first 12 moves (piece moved twice, queen out early, not castled by move 10, undeveloped minor pieces, no central pawn), each shown once per game with one habit to practise.
  - A Hint button that reveals a tactic in three steps, only when you ask.

**Play tab (play against the computer)**

A full game against Stockfish at one of six levels: Beginner, Novice, Casual, Club,
Advanced and Master. Pick White, Black or random. Stockfish's own strength limit
starts around 1320 Elo, which is far too strong for beginners, so the lower levels
ask the engine for several candidate moves at a shallow depth and choose among them
with some randomness: the worse a move, the less likely it is to be played. The
Beginner level also makes the occasional random move. Master is full-strength
Stockfish. The level settings live in `src/lib/play/levels.ts`.

- Blunder alerts, hints and live analysis are off during the game.
- Take back undoes your last move and the computer's reply. Resign asks for confirmation.
- **Live coach (optional).** Tick "Live coach" before starting and the engine checks
  each of your moves before the computer replies. After an inaccuracy, mistake or
  blunder a coach card says what it cost and what was better, with a **Take it back**
  button. It makes the computer a little slower to reply.
- When the game ends (checkmate, draw or resignation) a banner offers **Review game**,
  which runs the normal game review on it.
- Every finished game is saved (the last 50) under **Past games** with the result,
  level and date, and each one has a **Review** button that loads it onto the board
  and reviews it. The tab also shows your wins, losses and draws per level.

**Move classification**

Every move is rated by centipawn loss against the engine's best move, using the beginner scale from Chess Rocket:

| Centipawns lost | Class |
|---|---|
| 0 | Best |
| 1 to 30 | Great |
| 31 to 80 | Good |
| 81 to 150 | Inaccuracy |
| 151 to 300 | Mistake |
| over 300 | Blunder |

Missing or allowing a forced mate is always a blunder. The same scale is used by the live alerts, the game review, the review summary and the PGN comments.

**Openings tab**

Seventeen openings plus one trap line for each colour, each with a main line of
8 to 12 moves, one or two sidelines, an explanation for every move, key ideas and a
trap to watch for. Technical words in the commentary have a dotted underline with a
plain definition on hover. Modes: step through, autoplay with speed control, a
drill where you play your side from memory (two tries per move, then the answer),
and a Traps step at the end of the lesson for openings that have matching trap
puzzles. Drill success rates are stored in your browser's localStorage.

All opening content lives in `src/openings/*.ts`, separate from the UI.

**Puzzles tab**

478 puzzles in nine sets (forks, pins, skewers, back rank, checkmate patterns,
endgames, opening moves, opening traps, longer puzzles) or a mixed set. The board
turns to face the side to move; you find the moves and the app plays the replies.

- **Longer puzzles.** `npm run puzzles:extend` plays each short puzzle on with
  Stockfish at depth 16 and keeps adding the opponent's best reply and your answer
  (up to four of your moves), as long as your move is clearly the right one: you stay
  winning (a mate, or at least +2) and the move is a mate or at least 1.5 pawns better
  than the second choice. All endgame puzzles are now four moves long, and several
  tactics got their natural follow-up (for example `Nxc7+ Kd8 Nxa8`). Mate-in-one
  puzzles, and puzzles whose position is not clearly winning after the first move,
  stay as they were. Extended puzzles carry `extended_from` with their original length.
- **Longer puzzles set.** 240 puzzles from real Lichess games, 40 each for forks,
  pins, skewers, back-rank mates, checkmates and endgames. Every one takes at least
  three of your moves, is rated 800 to 1600 on Lichess and is among the most played
  and best liked in its rating band. `npm run puzzles:lichess -- <file>` rebuilds the
  set from the downloaded database.
- **Alternative moves count.** If you play a different move than the stored answer,
  Stockfish checks it. If it is rated Best or Great on the usual scale (at most 30
  centipawns worse, or any mate when a mate was available), it counts as correct
  ("That works too!"). From then on the engine plays the replies and judges your
  moves, since the stored line no longer applies. Any checkmate is always accepted.
- **Unlimited attempts.** A wrong move snaps back with "Not quite, try again" and you
  stay on the same move; a mistake on move 3 never sends you back to move 1. An
  attempt counter shows the wrong tries on the current move.
- **Hints, only when you click.** Each click goes one level deeper: 1 the theme
  ("Look for a fork"), 2 the piece to move is highlighted, 3 the target square is
  highlighted, 4 the whole move is shown as an arrow. Settings has "Auto offer hint
  after 2, 3 or 5 wrong tries" (off by default); it only makes the Hint button pulse.
- **Give up** is never automatic. It shows the solution one move at a time with an
  arrow and the motif explanation.
- **Scoring:** Clean (no hints, no wrong tries), Assisted (solved with hints or
  retries) or Failed (gave up). Stats per set track all three; the streak continues
  on Clean or Assisted and resets on Failed.
- **Retry puzzle** on the result screen, and **Retry failed** next to any set with
  puzzles you gave up on.

The opening drill and the review cards use the same rules: unlimited tries, the same
four hint levels, and a give-up button that shows the move.

**Cards tab (mistake review with spaced repetition)**

After a game review, one click turns every inaccuracy, mistake and blunder into a
card: the position before your move, the move you played and the engine's best
move. Cards are scheduled with the SM-2 algorithm at 4 hours, 1 day, 3 days,
1 week, 2 weeks and 1 month; a grade below 3 resets to 4 hours and each card keeps
its own ease factor. A card shows the position and asks for the best move, with
unlimited tries and the same hints as puzzles. Grades: Clean 5, solved with retries
only 4, used hint level 1 or 2 is 3, used hint level 3 or 4 is 2, gave up 0. The tab shows a due-count badge.
Cards are stored in localStorage and can be exported to and imported from a JSON
file.

**Review tab (game review with a coach)**

"Review game" analyses every position at depth 14 with a progress bar, classifies
each move with the better move where it matters, draws a clickable evaluation graph
and shows a per-side summary. The review is offered automatically when a game ends.

The coach then goes through the game with you:

- **Move by move.** ⏮ ◀ ▶ ⏭ (or the arrow keys) step through the game, and
  **Play-by-play** steps by itself, pausing on inaccuracies, mistakes and blunders
  (switch that off to watch the whole game). The board marks the move just played
  with its class badge (★ ! ✓ ?! ? ??), and the summary table highlights that class.
- **Summary table as a navigator.** Click any count to jump to that side's next move
  of that type, for example Black's blunder.
- **What the coach says.** For every move: whether it was the top move, how much it
  cost, what was better, and what the move allowed. It plays the engine's lines a few
  moves ahead and points out what a beginner should notice: forks, undefended pieces,
  checkmates, promotions and how much material changes hands.
- **💡 Show best move** draws the better move on the position before your move.
- **▶ Play best line** plays the better line up to six moves forward on the board, so
  a missed fork two or three moves deep is visible. **⚠ Show the danger** does the same
  for the opponent's best answer to a mistake. Step through either line move by move,
  pause it, or press **Back to the game**.

**Reviewing chess.com games.** Paste a chess.com game or review link (for example
`https://www.chess.com/game/live/123456789` or `.../analysis/game/live/123456789/review`)
into the box in the Review tab or into Import PGN. The app loads the game from
chess.com's public game data and starts the review. This works in the desktop app;
the browser version explains how to paste the PGN instead.

**Progress tab**

Games reviewed, average accuracy with a chart over time, totals per move class,
puzzle stats per motif, due review cards and opening drill success rates. All from
localStorage.

## Windows desktop app

Mirror Gambit also ships as a Windows desktop app built with Electron, and updates
itself from this repository's GitHub releases.

**Install:** download `Mirror-Gambit-Setup-<version>.exe` from the
[latest release](https://github.com/ItsNaCl/mirror-gambit/releases/latest) and run it.
It installs for your Windows user only (no admin prompt) into
`%LOCALAPPDATA%\Programs\Mirror Gambit`, with Start menu and desktop shortcuts and an
entry in Settings > Apps. Your progress lives in `%APPDATA%\Mirror Gambit` and is kept
across updates and reinstalls. The installer is not code-signed, so SmartScreen may
say "Windows protected your PC" the first time: choose **More info > Run anyway**.

**Updates:** the app checks GitHub 10 seconds after it starts and every 6 hours.
When a newer version exists, a bar under the header offers **Download update**, then
**Restart and update**. Settings > Updates shows the current version and has
**Check for updates**. Nothing is downloaded until you click.

**Upgrading from 1.1.0 (the MSI):** uninstall "Mirror Gambit" once in Settings > Apps,
then run the new Setup.exe. Your progress is kept. From then on updates are in-app.

**Portable:** `Mirror-Gambit-<version>-Portable.exe` is a single file with no install.
All data is kept in a `MirrorGambitData` folder next to it. It cannot update itself;
Settings > Updates links to the releases page.

**Publishing a new version:**

1. Bump `"version"` in `package.json` (for example `1.2.1`) and commit it on `main`.
2. Tag and push: `git tag v1.2.1` then `git push origin v1.2.1`.
3. GitHub Actions (`.github/workflows/release.yml`) runs the tests and lint, builds the
   installer and the portable exe, and publishes them with `latest.yml` as a release.
   Installed copies offer the update within a few hours, or straight away with
   **Check for updates**.

**Build it yourself:**

```bash
npm run icon            # regenerates build/icon.ico (optional, already committed)
npm run dev:desktop     # Electron with the Vite dev server and hot reload
npm run build:desktop   # web build + main process + Setup.exe and portable exe into release/
```

Most of the size is the four Stockfish builds (two 99 MB full-strength networks plus
the lite ones), so the installer is about 230 MB.

How the shell works: the built app is served through a privileged `app://`
scheme whose every response carries the COOP/COEP headers, so the page is
cross-origin isolated and the multi-threaded Stockfish worker gets
`SharedArrayBuffer`. The main process logs the isolation check and which engine
build loaded to `mirror-gambit.log` in the data folder. The window has
`contextIsolation`, `sandbox` and a strict Content Security Policy, blocks all
navigation and new windows, and opens external links in the default browser. A small
preload script (`electron/preload.ts`) gives the page exactly two things: the update
controls (`electron/updater.ts`, electron-updater) and a fetch of one chess.com game's
public JSON by numeric id. The review-card JSON export uses a save dialog and the
import an open dialog, as in the browser.

## Engine notes

- Stockfish 19 comes from the `stockfish` npm package and runs in a Web Worker.
- The multi-threaded build needs `SharedArrayBuffer`, which needs the page to be
  cross-origin isolated. The Vite dev and preview servers send
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` for that. If you host the `dist/`
  folder yourself, send the same two headers.
- If `SharedArrayBuffer` is not available, the app automatically falls back to the
  single-threaded build.
- The full build is about 100 MB and takes a few seconds to load the first time.
  Settings offers a 2 MB "lite" build that loads instantly and is still far
  stronger than any human.
- Thread count defaults to your core count minus one (max 8) and can be changed in Settings.

## Tests

`npm test` runs Vitest:

- move classification thresholds (`src/lib/analysis/classify.test.ts`)
- practice scoring (Clean, Assisted, Failed), streaks, hint levels, auto-offered hints, SRS grade mapping and alternative-move acceptance (`src/lib/practice/practice.test.ts`)
- computer opponent levels and move choice (`src/lib/play/levels.test.ts`)
- the review coach: line expansion, forks, undefended pieces, mates, material and the coach text (`src/lib/coach/coach.test.ts`)
- chess.com links and the TCN move decoder, checked against a real game (`src/lib/import/chesscom.test.ts`)
- saved games against the computer (`src/lib/play/savedGames.test.ts`)
- opening principle checks (`src/lib/tips/principles.test.ts`)
- engine driver and stale-result handling with a fake worker (`src/lib/engine/engine.test.ts`)
- UCI parsing and score formatting (`src/lib/engine/uci.test.ts`)
- game review building (`src/lib/review/review.test.ts`)
- SM-2 scheduling, resets, ease factor and import/export (`src/lib/srs/srs.test.ts`)
- puzzle validation: every FEN loads in chess.js and every solution move is legal in sequence; anything that fails is dropped and logged (`src/lib/puzzles/puzzles.test.ts`)
- opening trap puzzle matching (`src/openings/trapPuzzles.test.ts`)
- progress accuracy maths (`src/lib/progress/history.test.ts`)
- opening validation (`src/openings/openings.test.ts`): replays every main line,
  sideline and trap with chess.js and fails on any illegal move, checks that every
  opening name exists in the Lichess dataset and that the dataset's moves for that
  name start the main line.

## Opening line evaluation

Before the commentary was finalised, every main line, sideline and trap was
evaluated with Stockfish at depth 18 (`npm run openings:check`). Lines where the
side the opening is for ends up worse than -0.7 are flagged in
`scripts/opening-eval-report.md` for review. The current report has no flagged
lines. Trap lines are listed for information only, since their final positions are
lopsided on purpose.

## Project layout

```
scripts/            engine helpers, opening data build and evaluation scripts
src/components/     board, panels, move list, modals, glossary
src/hooks/          game state, engine, tips, trainer, puzzles, cards (SRS), play vs computer, review, settings
src/lib/chess/      rules helpers, PGN, FEN validation, game-over messages
src/lib/engine/     Stockfish worker driver and UCI parsing
src/lib/analysis/   move classification
src/lib/tips/       principles, opening detection, hints
src/lib/puzzles/    puzzle loading, validation and motif explanations
src/lib/srs/        SM-2 spaced repetition
src/lib/review/     game review
src/lib/progress/   review history for the progress page
src/lib/play/       computer opponent levels and saved games
src/lib/coach/      review coach: engine lines turned into plain-language lessons
src/lib/import/     chess.com game links
electron/           desktop shell: main process, preload bridge, updater
.github/workflows/  CI on every push, and the release build on version tags
src/openings/       opening content (one file per opening), trap-puzzle matching, validation tests
src/data/           bundled Lichess opening names (CC0) and puzzle sets
```

## Credits

- [Stockfish](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0)
- [chess.js](https://github.com/jhlywa/chess.js) and [react-chessboard](https://github.com/Clariity/react-chessboard)
- Opening names from the [Lichess chess-openings](https://github.com/lichess-org/chess-openings) dataset (CC0)
- The "Longer puzzles" set (`src/data/puzzles/lichess-longer.json`) is selected from the
  [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0) by `scripts/import-lichess-puzzles.mjs`.
  Each puzzle keeps its Lichess id in `source`.
- [Chess Rocket](https://github.com/suvojit-0x55aa/chess_rocket) by suvojit-0x55aa, licensed under the
  GNU General Public License v3.0. Mirror Gambit used it as reference material and ported, in TypeScript,
  its six-level move classification scale, the SM-2 spaced-repetition scheduling (same intervals and ease
  factor rules as `scripts/srs.py`), and its tactical motif catalogue as beginner explanations. The nine
  puzzle JSON files in `src/data/puzzles/` are copied from its `puzzles/` folder. Its reference notes on
  opening teaching, common beginner mistakes and chess pedagogy shaped the wording of the opening
  commentary, principle reminders and move alerts. No Python code was copied.

## License

Mirror Gambit is free software, licensed under the
[GNU General Public License v3.0](LICENSE). It bundles Stockfish and puzzle data from
Chess Rocket, which are GPL-3.0 as well. You may use, change and share it under the
same terms: anything built from it must also be shared under GPL-3.0 with its source.
