# Security audit, v3 (October 29 2026)

Scope: the Electron shell and its IPC surface (`electron/main.ts`, `preload.ts`, `coach.ts`, `updater.ts`),
the Claude API key handling, the chess.com and Lichess fetches (main process and browser), the PWA
service worker and build config, string to HTML paths in `src/`, the GitHub workflows, the Node scripts
that download or parse external data, and `npm audit`. Source review only, no live probing. Three
reviewers worked the surfaces in parallel; each candidate had to name the lower trust principal, the
input, the control meant to stop it and the concrete result. Missing best practices without a reachable
boundary violation are listed as hardening, not findings.

## Confirmed findings and what was done

No critical or high finding in the code. The one high item was a dependency advisory.

| Severity | Finding | Decision |
|---|---|---|
| high (advisory) | `electron` 44.7 was in the range of GHSA-jr5w-w6x2-84p9 (mitigation for compromised eMudhra intermediate certificates). | Fixed: bumped to 44.10. `npm audit` is clean. |
| moderate (advisory) | `fast-uri` 3.0 to 3.1.8, transitive, four URI parsing advisories. | Fixed by `npm audit fix` (non-breaking). |
| low | A non-string player name in a Lichess or chess.com answer was stored as is and blanked the My games screen on every visit (React cannot render an object). | Fixed: every remote field is shaped before it is stored (`src/lib/games/sources.ts`), one bad record is skipped instead of failing the import, a chess.com game needs a `www.chess.com` url, and the id characters are checked. Regression test added. |
| informational | The main process game fetches followed redirects, so the fixed hosts could be redirected by the answering server to any URL (a blind GET, no exfiltration path from the page). | Fixed: every fetch uses `redirect: 'error'`, in the main process and in the browser build. |
| informational | One crafted record (a date out of range, a bad percent escape in the opening url) threw and aborted the whole import. | Fixed with the shaping above. |

## Needs validation (facts outside the source)

| Item | Decision |
|---|---|
| The Windows installer is not code signed, so electron-updater has no Authenticode check and update integrity rests on TLS to GitHub plus the sha512 in `latest.yml` from the same release. | Known and accepted for now: signing needs a certificate Daniel does not have yet. Until then `autoInstallOnAppQuit` stays as it is (the student presses Download first) and the release can only come from a tag on `main` (below). Revisit when a certificate is bought. |
| The release workflow published any `v*` tag without checking the commit was on `main`. | Fixed: `release.yml` now refuses a tag whose commit is not on `main`. A tag protection rule for `v*` in the repository settings is still recommended (not source). |

## Hardening done in this pass

- Every IPC handler now checks that the caller is the app's own page (`fromApp` in `electron/main.ts`), in main, the coach and the updater. Not reachable before (navigation, window.open, webviews and frames are all blocked), now explicit.
- Response bodies from the game sites are capped at 20 MB and a chess.com month at 500 games, in both the main process and the browser build.
- The Claude client pins `baseURL` to `api.anthropic.com`, so an `ANTHROPIC_BASE_URL` in the environment cannot send the key elsewhere. `coach:status` reports whether the key file exists instead of decrypting the key for a boolean.
- The dev server allow check compares origins instead of a string prefix.
- Stored shapes are checked on read in `useLibrary`, `useCoach` and `useSettings`, so a damaged or older record is dropped instead of blanking the app at start.
- Hash routes are matched on own keys only (`#/constructor` no longer yields a route).
- Model game links are kept only when they are a Lichess game page.
- `ci.yml` has `permissions: contents: read`.

## Hardening noted, not done

| Note | Decision |
|---|---|
| No React error boundary: a render exception blanks the whole app. | Left: the stored shape checks above remove the known causes. Add a boundary with the UI redesign. |
| The web build has no Content Security Policy (GitHub Pages sends none). No HTML sink exists in `src/`. | Left: a meta CSP must allow the engine worker, blob workers and the two game sites and needs a test on the phone build first. |
| GitHub Pages project sites share the `itsnacl.github.io` origin with the account's other Pages repos (storage and cache names are origin wide). | Left: same owner, no boundary. A user site would separate it. |
| Workflow actions are pinned by major tag, not commit SHA. | Left: pin when the release workflow next changes. |
| `safeStorage` on Windows is user scope DPAPI: any process running as the same user can decrypt the key file. | Accepted: the OS account is the protection, and Settings says so. |
| The log file grows without bound and mirrors renderer error messages. | Left: same user, harmless; rotate if it ever matters. |
| `useRatedPuzzles` and `useCourse` read stored progress without a shape check. | Left: both coerce the fields they read; a damaged record costs a reset of that progress at worst. |
| Anthropic SDK still reads `ANTHROPIC_AUTH_TOKEN` from the environment when no `authToken` is passed. | Left: same user environment; the SDK treats `apiKey` and `authToken` as exclusive, so forcing one is not worth the risk of a client error. |
| The Vite dev proxy `/chesscom` forwards any sub path to `www.chess.com/callback`. | Dev server only. |
| Scripts parse operator supplied files without line length caps. | Operator only, repository paths only. |
