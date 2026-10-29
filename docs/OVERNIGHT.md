# Overnight build: run everything to the end without asking

Daniel has approved this whole run in advance. Do not ask for approval, confirmation or preferences at any point. Where a decision is needed, take the option the plan recommends, write it in the "Decisions" section at the bottom of this file, and keep going.

## Order of work
1. `docs/HANDOFF.md` tasks 1 to 4 (progression wiring, Today screen, rank card and badges, sounds).
2. `docs/PLAN-v3.md` phase 2, one mode per commit, in this order: why not this move, guess the move, narrated game, over the board entry, mistake card grouping and Woodpecker cycles. Each mode follows the mode pattern in `CLAUDE.md` (own `useGame`, route, session builder, `sessionFor` case) and the Today screen's `openBlock` learns to start it.
3. `docs/HANDOFF.md` task 7, the security audit.
4. Update `README.md` with the v3 features and `CLAUDE.md` with every new module, in plain language.

## After every task
- `/review` on the changed files, fix what it finds.
- `npm test`, `npx tsc -b`, `npm run lint` with no new lint errors. If a check fails, fix it before moving on; never skip a check or weaken a test to pass.
- Commit on `v3-coach` as `NaCl <22365495+ItsNaCl@users.noreply.github.com>` with a plain message. Do not commit `package-lock.json` unless a dependency changed. Do not push; Daniel pushes in the morning.
- Mark the task done in the "Progress" section below, so a restarted session resumes at the right place.

## If you stop or restart
Read "Progress" below first and continue from the first task not marked done. Never redo a task that is marked done.

## Hard limits that still hold overnight
- No real time assistance during Chess.com games, anywhere in the code.
- No secrets, personal emails or local paths in the repo.
- Never change `appId`, `productName` or the `publish` block in `electron-builder.yml`.
- Do not delete user data keys or change stored shapes without a normaliser for the old shape.
- Do not install dependencies beyond what a task plainly needs. Prefer code over packages for confetti, sounds and animation.
- Stay in this repository. Do not touch files outside it.

## Progress
- [x] HANDOFF task 1
- [x] HANDOFF task 2
- [x] HANDOFF task 3
- [ ] HANDOFF task 4
- [ ] Phase 2: why not this move
- [ ] Phase 2: guess the move
- [ ] Phase 2: narrated game
- [ ] Phase 2: over the board entry
- [ ] Phase 2: card grouping and Woodpecker cycles
- [ ] HANDOFF task 7, security audit
- [ ] README and CLAUDE.md updated

## Decisions
(append one line per decision taken without Daniel)
- Tasks 1 and 2 were already committed (2287baa, 00ac015) but unchecked here; verified the code is in place and marked them done instead of redoing them.
