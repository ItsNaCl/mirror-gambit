# Mirror Gambit v3: the personal chess coach

## Context

Daniel (Chess.com `HibernatingBear00`, under 800, plays blitz 5) wants a coach that trains him to beat players rated 1200 to 1600 reliably. Target: 1600 to 1800 Chess.com rapid, 6 to 10 hours a week, phone and PC, over the board sometimes. He learns by doing and by comparing alternatives. He wants the coach to decide what to train each day, to explain the why at his level, to narrate games, and to hold him accountable.

The existing app `ItsNaCl/mirror-gambit` (v2.6, React 19, Vite, TypeScript, Stockfish 19 WASM, Electron and PWA, no backend, IndexedDB) already has the tools: game import from Chess.com and Lichess, a mistake profile (`src/lib/games/profile.ts`), SM-2 cards from own blunders (`src/lib/srs/`), a repertoire drill (`src/lib/repertoire/`), 3,000 rated Lichess puzzles, courses, play vs engine with a live coach, a review coach (`src/lib/coach/coach.ts`, `explain.ts`, `features.ts`) and a Claude coach grounded in engine lines (`src/lib/coach/claudeContext.ts`, `electron/coach.ts`). What it lacks is a coaching brain that plans, the learning formats Daniel picked, Maia-based "findable at your rating" judgement, and anything that runs while the app is closed.

Decision taken: build v3 on Mirror Gambit, add a small server package for background work, redesign the UI as a later phase. Chess.com only, post game review is acceptable. Research (three reports, sources in `docs/research/` once written) is summarised in the curriculum below.

## Hard rules from the research and the questions

1. No real time assistance during Chess.com games. Anything engine derived shown before the game ends is cheating under Chess.com fair play rules, and their PubAPI terms ban extensions that run engines. The coach reviews a game the moment it is over (game link fetch already exists in `src/lib/import/chesscom.ts` and `electron/main.ts`).
2. Explanations come from verified facts only: Stockfish lines, the board reading in `features.ts`, Maia findability. Claude phrases, it never calculates. This is the Take Take Take pattern and the existing `claudeContext.ts` already does it.
3. Time control is the coach's call, and the coach's default at this level is 15 plus 10 rapid. Blitz is allowed as a bounded side activity the planner schedules on purpose.
4. Opening repertoire: 1.e4 with the Italian (Scotch as the second line), 1...e5 as Black against e4, Queen's Gambit Declined setup against d4. The Ponziani is kept as a known line, not the main one. Existing content in `src/openings/italian.ts`, `scotch.ts`, `qgd.ts`, `ruyLopez.ts`.
5. No book text from any coach. Methods and structure only.

## The curriculum (what the coach knows)

Rating bands use Chess.com rapid. Each band has a weekly time split, a habit list, and exit criteria the planner checks against real data.

### Band 1: under 1000 (now)
- Split: 40% tactics and blunder check drills, 40% play 15+10 and review every game, 10% basic endgames (mates, king and pawn, square of the pawn), 10% opening principles with the chosen repertoire to move 6 to 8.
- Habits (from Heisman, Bartholomew, Building Habits, the 2000+ survey): before every move list checks, captures and threats for both sides. Count attackers and defenders before capturing. Castle by move 10. Take free pieces. When unsure make a quiet improving move.
- Exit: fewer than 1 hung piece per game over the last 20 reviewed games, rapid rating 1000+, blunder check drill accuracy above 90%.

### Band 2: 1000 to 1300
- Split: 35% tactics, 35% play and review, 15% endgames (Lucena, Philidor, opposition), 10% strategy (Silman imbalances, Aagaard three questions), 5% openings to move 10 with plans.
- Habits: Heisman five questions on every critical move. Wishlist method (Naroditsky). Fix the cause of a threat, not the symptom.
- Exit: rating 1300+, average centipawn loss trending down, endgame conversion rate above peers.

### Band 3: 1300 to 1600
- Split: 30% tactics with calculation (candidate moves, Kotov light), 35% play and review, 15% endgames, 15% strategy and model games, 5% openings.
- Habits: candidate moves listed before calculating. Prophylaxis every move. Plans from pawn structure.
- Exit: rating 1600+, wins against 1400+ opponents at 60%+.

### Band 4: 1600 to 1800
- Split: 25% calculation, 30% play and review, 15% endgames (de la Villa selection), 20% strategy, 10% openings as plans.
- This is the target. Yusupov Build Up 1 style graded tests can be added here.

Diagnostics that drive the planner (Aimchess style, computed from `profile.ts` plus new metrics): hung pieces per game, missed tactics by motif, phase where games are lost, time left at game end, advantage conversion rate (won position at move N that ended in a draw or loss), opening score by line, repeat mistakes (same tag three times in 10 games).

## The learning formats (what the coach does with Daniel)

All four picked. Each is a mode with its own `useGame` and session builder, following the pattern in `src/sessions/sessions.ts` and `src/app/routes.ts`.

1. **Why not this move.** From a position in Daniel's own game or a model game: he plays his idea, the engine plays the refutation line on the board, the coach explains what it allowed, then shows the better move and plays its line. Reuses `CoachPanel` play best line and show the danger, plus `explain.ts`. New: a compare view with both lines side by side and the Maia percentage of players at his rating who find each.
2. **Guess the move.** Model games chosen by opening and theme, Daniel guesses each move for one side, scores by centipawn distance, coach narrates why the master's move beats his when they differ. Needs an annotated model game set (Lichess elite database games in his repertoire, CC0, filtered by opening, plus a curated 50 from public domain classics).
3. **Speedrun style narrated game.** The coach plays a game against a Maia bot at Daniel's rating and narrates its thinking each move in the chosen coach voice, pausing for Daniel to predict the move first. Later version: Daniel plays and the coach narrates after the game as a sealed replay.
4. **Blunder drills on a schedule.** Already exists as cards. Upgrade: cards grouped by tag, Woodpecker style cycles for a fixed set from his own games, and the planner decides daily due load.

Plus: **Over the board game entry** (move list entry on the phone with chess.js validation, photo of a board is a later phase and would need a board recognition model), and **daily session plan** with sizing (20 to 60 minutes, coach picks), streak, weekly report, Discord DM via the server.

Coach voices: one default (direct, plain, Naroditsky clarity plus Heisman checklists), switchable modes including a playful one. Implemented as prompt presets in `claudeContext.ts` plus a rule based fallback when Claude is off.

## Architecture

```
mirror-gambit/
  src/                      existing app, v3 additions below
  src/lib/coach/curriculum.ts   bands, splits, habits, exit criteria (pure data plus functions)
  src/lib/coach/planner.ts      builds today's session from profile, due cards, streak, time budget
  src/lib/coach/metrics.ts      Aimchess style diagnostics from AnalysedGame[]
  src/lib/coach/voices.ts       prompt presets per coach voice
  src/lib/coach/maia.ts         client for the server's findability endpoint, with a graceful "unknown" when offline
  src/lib/modes/whyNot.ts, guessTheMove.ts, narrated.ts, otbEntry.ts
  src/hooks/useCoachHome.ts, useWhyNot.ts, useGuess.ts, useNarrated.ts, useOtb.ts
  src/components/CoachHome.tsx (new front door), WhyNotPanel.tsx, GuessPanel.tsx, NarratedPanel.tsx, OtbPanel.tsx, WeeklyReport.tsx
  src/data/model-games/*.json   curated and filtered model games
  server/                   new package, TypeScript, Node 20, Docker
    src/index.ts            Fastify API, token auth, CORS for the app origin
    src/engine.ts           native Stockfish 19 via UCI (reuse scripts/engine-node.mjs logic)
    src/maia.ts             spawns Maia-3 (Python, maia3 package) as a UCI engine, MultiPV gives human move distribution per rating
    src/import.ts           polls Chess.com PubAPI for HibernatingBear00 monthly archives with ETag, identifying User-Agent, serial requests
    src/review.ts           reviews new games at depth 18, stores results
    src/reports.ts          weekly report, Discord DM
    src/scheduler.ts        node-cron: import every 2 hours, review on arrival, report Sunday evening
    src/db.ts               SQLite via better-sqlite3
    Dockerfile, docker-compose.yml
```

Decisions:
- Server is optional. The app keeps working offline with the browser engine. When the server is reachable (Settings: server URL and token) the app syncs games and reviews from it, asks it for Maia findability, and shows the weekly report. Sync shape: the server is the source of truth for imported games and reviews, the app owns cards, repertoire and progress until a later phase.
- Host: Synology NAS in Docker is the right fit if the NAS has an x86 CPU with 4+ cores (Maia-3 23M on CPU is fine, Stockfish depth 18 on 2 threads is seconds per position). If the NAS is ARM or weak, run the same compose file on the Windows PC with Docker Desktop and Tailscale. The plan does not assume which, the compose file is the same. The server host is decided at phase 3 after checking the NAS model.
- Remote access: Tailscale on NAS or PC and the phone. No port forwarding. The PWA on GitHub Pages cannot reach a Tailscale address over HTTP from HTTPS, so the phone uses the Electron free path: serve the built app from the server itself (Fastify static with COOP/COEP) over Tailscale HTTPS (Tailscale serve gives a cert). The GitHub Pages PWA stays for offline use.
- Claude API lives in two places: the existing Electron path for desktop, and the server for background reports and narration pre-generation. Key stored in the server env file, never in the repo.
- Repo stays public GPL-3.0. Game data, keys and reports never committed. `server/` gets its own README.

## Claude API cost and value (for the separate discussion)

Measured basis: the existing `usage.ts` pricing and the README's figure of about 1 cent per question on Sonnet.
- Game review explanations: 5 key moments plus a summary, about 6 calls, roughly 6 cents on Sonnet per game. 5 games a week is 30 cents.
- Daily session plan: rule based, no Claude needed. Optional 1 call for the coach's framing, 1 cent.
- Narrated game: about 40 short calls at 1 cent, 40 cents per narrated game, or pre-generated once and replayed.
- Weekly report: 1 call, 5 cents.
- Follow up questions: 1 to 2 cents each.
Estimate at Daniel's stated usage: 2 to 5 dollars a month on Sonnet, under 1 dollar on Haiku, 10 to 20 on Opus. Value: the why in plain words and follow up questions. Without it, `explain.ts` still produces the facts in short sentences, which is what Aimchess and Chess.com give. Recommendation: Sonnet for reviews and reports, Haiku for narration, cap at 10 dollars a month in Settings (the cap already exists).

## Phases

### Phase 1: coaching brain and front door (app only, no server)
1. `curriculum.ts`, `metrics.ts`, `planner.ts` with tests. Planner input: profile, due cards, last 7 days of sessions, time budget. Output: ordered session blocks with minutes and a one line reason each.
2. `CoachHome.tsx` as the default route: today's plan, start button that walks through blocks, streak, band and exit criteria progress.
3. Session log stored in `kv.ts` under `mirror-gambit.sessions.v1`.
4. Settings: time control preference (coach default 15+10), weekly hours, voice.
Verification: `npm test`, `npx tsc -b`, `npm run lint`, then import HibernatingBear00's last 3 months, run the batch review, confirm the planner produces a sensible band 1 plan and the reasons match the profile.

### Phase 2: the four formats plus OTB entry
1. Why not this move: mode, panel, compare view. Source positions: own mistakes from the library, then model games.
2. Guess the move: model game data build script (`scripts/build-model-games.mjs` from the Lichess elite database filtered by the repertoire ECO codes, plus curated classics), scoring, narration via `explain.ts` and optional Claude.
3. Narrated game: Maia bot opponent needs the server, so phase 2 ships it against the existing Stockfish levels and swaps in Maia in phase 3. Prediction pauses, voice presets.
4. OTB entry: move list entry panel with SAN validation and immediate review.
5. Blunder drills: tag grouping and Woodpecker cycles in `srs.ts`, planner integration.
Verification: play through each mode end to end in the dev server and on the phone PWA preview, unit tests for scoring and the model game build, `npm run courses:check` style validation for model games (every move legal, every annotation move within 30 cp of Stockfish best).

### Phase 3: server package
1. Fastify API, SQLite, native Stockfish, Chess.com poller with ETag and User-Agent, review on arrival at depth 18.
2. Maia-3 findability endpoint: given FEN and rating, return the human move distribution. Used by why not this move and review explanations ("only 12% of 800s find this").
3. Scheduler, weekly report, Discord DM (bot token in env).
4. App integration: server settings, sync, Maia client, report view.
5. Docker compose, Tailscale serve, docs. Check NAS CPU first.
Verification: deploy to the chosen host, confirm a new Chess.com game appears reviewed within the poll window, Maia returns distributions for 10 test positions that match published Maia behaviour, Discord report arrives Sunday, phone reaches the app over Tailscale.

### Phase 4: UI redesign (later, separate plan)
Front end shell rebuilt around the coach. Logic untouched.

## Reuse map (do not rebuild)
- Engine: `src/lib/engine/engine.ts`, `scripts/engine-node.mjs`
- Classification and explanation: `src/lib/analysis/classify.ts`, `src/lib/coach/explain.ts`, `features.ts`, `coach.ts`
- Claude grounding: `src/lib/coach/claudeContext.ts`, `usage.ts`, `electron/coach.ts`
- Import and profile: `src/lib/games/sources.ts`, `profile.ts`, `src/lib/import/chesscom.ts`
- SRS and practice: `src/lib/srs/srs.ts`, `src/lib/practice/practice.ts`, `useAttempt`, `HintBar`
- Mode pattern: `src/sessions/sessions.ts`, `src/app/routes.ts`, one `useGame` per mode
- Opening content: `src/openings/*.ts`, repertoire in `src/lib/repertoire/`
- Store: `src/lib/store/kv.ts` with versioned keys

## Open items to confirm during execution
- NAS model and CPU (decides server host).
- Discord bot token and whether the existing Discord channel plugin's bot can be reused.
- Whether Maia-3 weights licence allows this use (code is AGPL, weights unstated). Private use is fine either way.
