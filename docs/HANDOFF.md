# Handoff: where v3 stands and what is next

Branch `v3-coach`, October 29 2026. Read `PLAN-v3.md` for the full plan and `research/` for the sources. `CLAUDE.md` describes the coach modules.

## Done and pushed
1. Coach brain: `src/lib/coach/curriculum.ts`, `metrics.ts`, `planner.ts` with tests. Coach home (`src/components/CoachHome.tsx`, `src/hooks/useCoach.ts`) is the default route. `App.openBlock` starts each block's activity.
2. Imported games keep `userRating`; Settings has hours a week, rating override, coach voice.
3. Look: violet launcher theme in `src/styles.css` tokens, selectable accents and board themes via `[data-accent]` and `[data-board]`, motion level and sound in Settings (`src/hooks/useSettings.tsx` writes them to `<html>`), Sora display font.
4. Game layer logic: `src/lib/game/xp.ts` with tests. Ranks (Pawn to King), XP per event, badges, `award()`. Not wired to the UI yet.

## Approved design direction (from the mockup Daniel liked)
- Coach home becomes "Today": top row of four stats in Sora (rating, hung per game with trend, minutes today, XP today in the reward colour). Quests track on the left: the session blocks as cards on a vertical rail, XP per block, a knight marker on the current block that hops (CSS transform, 1.8s, only when motion is rich), confetti when the last block completes, level up flare on a new rank. Right column: habit of the day card in accent soft, a small board preview, earned badges as chips.
- Sidebar: rank card at the top (rank name in Sora, "Rank n of 6", XP bar in the reward colour, XP numbers), nav groups Coach, Play, Train, Learn, You. A Badges screen under You.
- Motion: rich on pointer devices (page transitions, pieces glide, cards flip on solve, numbers count up), snappy on touch (micro only), reduced = none. `motionLevel()` in useSettings already decides; CSS reads `[data-motion]`.
- Sound: synthesized with WebAudio, no audio files. Piece move, capture, check, clean solve, level up, streak. Master switch and volume exist in Settings (`settings.sound`, `settings.soundVolume`).
- Ranks are pieces. Accent swatches exist. Gold is the best move and a win.

## Next tasks, in order
1. `src/hooks/useProgression.ts`: load and save `Progression` under `mirror-gambit.progression.v1` (normalise with `normaliseProgression`), expose `award(event)`, `rank`, `next`, `progress`, `badges`, and a transient `lastGain` plus `levelUp` for the UI. Wire events in `App.tsx`: block done (`useCoach.complete`, pass a callback through `CoachInput`), streak bonus on the first block of a day, rated puzzle results (`useRatedPuzzles` scoring effect, add an `onResult` option), card grades (`useSrs.finish`), a review added (`review.historyVersion` change), a slow game played against the computer or imported (time class rapid or slower), band promotion (plan.band id changes from the stored one).
2. Restyle `CoachHome.tsx` into the Today screen per the mockup. Keep `useCoach` as is. Add the knight marker (inline SVG, not an emoji), confetti (own canvas component, 60 lines, respects `[data-motion]`), count up hook for the stat numbers.
3. Sidebar rank card in `src/app/Shell.tsx` (`Sidebar` gets a `rank` prop). Badges screen: route `badges` under You, catalogue from `BADGES` with earned dates.
4. `src/lib/sound/sfx.ts`: WebAudio tones. Hook `useSfx` reads settings. Play move, capture, check from the board session's last move in `App.tsx`; solve, level up and streak from the progression events.
5. Then phase 2 from `PLAN-v3.md`: why not this move first.
6. After every task above, before its commit and without asking: run `/review` on the changed files for bugs, fix what it finds, and only then run the checks and commit. If the skill is not installed, review the diff by hand for: state that is not persisted, effects with missing dependencies, engine calls without suspension (see Engine gotchas in CLAUDE.md), unhandled promise rejections, and copy that breaks the plain language rule.
7. Last step of the whole build, run without asking: a security audit of the app with the `/security-audit` skill. Scope: the Electron shell and IPC surface (`electron/main.ts`, `preload.ts`, `coach.ts`), the Claude API key handling, the Chess.com and Lichess fetches, the PWA service worker, any `dangerouslySetInnerHTML` or string to HTML paths, dependency advisories (`npm audit`), and anything the server package adds in phase 3 (token auth, CORS, the Chess.com poller). Fix every high and critical finding, list the rest in `docs/SECURITY-AUDIT.md` with a one line decision each, and commit. If the skill is not installed, do the same audit by hand against the OWASP Electron and web checklists.

## Verification Daniel still owes
Import `HibernatingBear00` on the desktop app, run the review, confirm Coach shows a rating, a named repeat mistake and sensible blocks. The sandbox that built this could not reach Chess.com.

## Rules that must hold
- No real time assistance during Chess.com games. Post game review only.
- `npm test`, `npx tsc -b`, `npm run lint` with no new errors before every commit. Commits as `NaCl <22365495+ItsNaCl@users.noreply.github.com>`.
- No emoji in the UI, no em dashes in copy, plain language.
