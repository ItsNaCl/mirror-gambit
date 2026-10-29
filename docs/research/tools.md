# Chess training tools in 2026, and the building blocks for a personal coach

Paraphrased from public sources, October 2026. Prices are US, as shown on the pages read at the time, and may have moved.

## Part A: products

| Product | Signal | Spaced repetition | Weakness detection | Explains why | Notes |
|---|---|---|---|---|---|
| Chess.com | Engine plus scripted Coach | Puzzles only | Insights (Diamond) | Templated | Free: 1 review a day. Game Review v2 adds phase grades and threat descriptions. |
| Lichess | Engine | No | Puzzle dashboard | No | Free. Studies, puzzle themes, Maia bots at 1100, 1500, 1900. |
| Chessable | Human author prose | MoveTrainer | No | Human prose | Pro about $12 a month or $75 a year, courses sold separately. Memorized lines are fragile without play. |
| Aimchess | Engine statistics | Partial | Six areas scored against peers | No | Free tier: one 40 game report a month. Premium about $8 a month. Best weakness detection found. |
| Chessly (Levy) | Human video plus drills | Drills | Thin weekly report | Video | Opening heavy for a beginner. Mixed reviews on progress tracking. |
| ChessTempo | Engine | Gold and up | No | No | Tactics, 17,000 endgame positions, guess the move mode. Dated interface. |
| DecodeChess | Explainable AI on Stockfish | No | No | Template text | Maintenance questionable. |
| Noctie | Human like neural bots | From your mistakes | Partial | No | About $14 a month. 25 bot levels, move grading. |
| Chessbook | Lichess explorer data | Yes (openings) | Repertoire deviations | No | A 1200+ tool. |
| Chess Dojo | Human curriculum | Manual | Manual | Via community | $15 a month. Best curriculum structure, classical games only, no automation. |
| Listudy | Explorer and engine | Yes (openings) | No | No | Free, open source. |
| Lucas Chess | Engines | Some | No | No | Free, open source, Windows, huge breadth, dated. |
| Maia platform (U of T) | Human move model | No | Per move | Partial | Free beta. Shows which moves players at each rating choose, a blunder meter. The only tool that says whether a move was findable at your rating. |
| Take Take Take (Carlsen) | Stockfish, detectors, Maia, Gemini | No | Per game | Yes | Free, launched January 2026. |
| Chessiro Coach | Stockfish 19 plus AI layer | Replay mistakes | Per game | Yes, with follow ups | Self reports 75 to 80% accuracy. |

Magnus Chess Academy reverted to Silver Knights Chess and its ChessKid coaching ended. Raw ChatGPT as a coach: good concepts, elementary tactical errors and invented square control.

### Lessons from Take Take Take's build
Stockfish first, then tactical and positional detectors, then Maia for how hard the move is at the player's rating, then the language model only phrases verified facts. Context design was the hard part; they pruned a large JSON context while measuring output quality. Explanations need the causal link, not a label. They run scenario based evals judged by domain experts and target under three seconds per move.

### Gaps nobody fills well
1. A closed loop: import every game, find recurring weaknesses across many games, explain the cause in plain language, generate spaced repetition drills from the player's own positions, re-test, measure.
2. Explanations matched to the player's rating. Engine best moves are often irrelevant below 1200.
3. Thinking process training, a blunder check routine, beyond Aimchess's Blunder Preventer.
4. A curriculum that adapts. Chess Dojo has the structure without automation; apps have automation without a long term plan.
5. Trustworthy explanations. Grounding the model in engine and detector facts is the known mitigation.

## Part B: building blocks

### Game data
- Chess.com Published Data API: `https://api.chess.com/pub/player/{user}/games/archives`, then `/games/{YYYY}/{MM}` (JSON) or `/pgn`. Serial requests unlimited, parallel may 429. Data refreshes every 12 to 24 hours, use ETag. Terms: read only, identifying User-Agent, no copying of Chess.com interface, browser extensions must be non commercial and must not run engine analysis. There is no live game feed.
- Lichess API: `GET /api/games/user/{username}` as PGN or ndjson with `since`, `until`, `max`, `perfType`, `evals`, `clocks`, `opening`, `accuracy`. One request at a time, wait a minute on 429. Puzzle endpoints (`/api/puzzle/daily`, `/next`, `/dashboard/{days}`, `/replay/{days}/{theme}`), cloud eval, study export. Opening explorer at `explorer.lichess.org` (`/masters`, `/lichess`, `/player`), tablebase at `tablebase.lichess.org`. Personal and commercial use allowed within limits. Lila is AGPL-3.0. Lichess streams live game moves, which Chess.com does not.

### Engines and human move models
- Stockfish 19 (September 2026, GPL-3.0) with WebAssembly targets; exits on invalid FEN or UCI, so validate input. stockfish.js is on 18, lite build about 7 MB, large over 100 MB, multi threaded needs cross origin isolation.
- Maia-2 (NeurIPS 2024): one model predicting human move probabilities and expected score per rating. `pip install maia2`, MIT code.
- Maia-3 (ICLR 2026, recommended): transformer models at 5M, 23M and 79M parameters that run as a UCI engine with Elo set by option and MultiPV giving the likely human moves. Code AGPL-3.0, weights licence unstated, a community ONNX export exists.

### Libraries
| Library | Use | Licence |
|---|---|---|
| python-chess | UCI, PGN with variations, Polyglot, Syzygy, SVG | GPL-3.0 |
| chess.js | Move generation, PGN, FEN | BSD-2 |
| chessground | Lichess board with arrows and shapes | GPL-3.0 |
| react-chessboard | React board | MIT |
| cm-chessboard | SVG board | MIT (pieces CC BY-NC-SA) |

### Data
- Lichess open database (CC0): 6.1 million rated puzzles (FEN, moves, rating, popularity, themes, opening tags; apply the first move before showing), 416 million evaluated positions, monthly game dumps.
- lichess-org/chess-openings (CC0): ECO, name, PGN, UCI, EPD.
- Lichess Elite Database: 2400+ versus 2200+ games, no bullet, derived from CC0 data.
- TWIC: personal use only, do not redistribute. PGN Mentor: no licence stated.
- Syzygy: use the Lichess tablebase API rather than hosting 6 and 7 piece tables.
- Annotated games with human commentary: Jhamtani et al. 2018 (about 298,000 move and comment pairs, research only), the concept guided commentary paper (2024) with code at ml-postech/concept-guided-chess-commentary. Lichess studies are exportable but each author sets the licence.

### Open source LLM plus Stockfish coaches
- ai-chess-training/LLM-ChessCoach (MIT): FastAPI, multi line Stockfish computes what each move loses, an LLM writes coaching text with a rule based fallback.
- danglingP0inter/Chesscetera (MIT): Swift, Stockfish depth 15 labels, per opening statistics, local Ollama report.
- ronaldsuwandi/thinkfish (MIT): putting the FEN before and after each move in the prompt cut hallucinations, explanations stayed unreliable.
- jalpp/chessagine-mcp (AGPL-3.0): an MCP server with Stockfish, theme analysis, openings.

The pattern that works: engine and rule based detectors produce verified facts (FEN plus main lines at minimum), Maia adds findability at the player's rating, the language model only phrases those facts, and an evaluation suite catches hallucinations.

### Licensing note
Stockfish, chessground, python-chess and Maia-3 are copyleft. Fine for a private app; hosting it for others or selling it means publishing the source under AGPL where Maia-3 or lila code is involved.

## Sources
- https://support.chess.com/en/articles/8562418
- https://www.chess.com/news/view/chesscom-launches-game-review-v2
- https://aimchess.com/
- https://chessly.com/
- https://en.chesstempo.com/memberships
- https://decodechess.com/
- https://alternativeto.net/software/noctie-ai/about
- https://64squares.substack.com/p/chessbook-review
- https://www.chess.com/blog/ChessDojo/launching-the-dojo-training-program-0-2400
- https://listudy.org/en
- https://lucaschess.pythonanywhere.com/
- https://www.maiachess.com/blog/platform-v1
- https://ai.engineer/talks/building-a-chess-coach
- https://chessiro.com/blog/best-ai-chess-coach
- https://www.chess.com/blog/damafe/i-tested-chatgpt-as-a-chess-coach-does-it-actually-work
- https://www.chess.com/news/view/published-data-api
- https://support.chess.com/en/articles/9650547-published-data-api
- https://lichess.org/page/api-tips
- https://github.com/lichess-org/lila-openingexplorer
- https://stockfishchess.org/blog/2026/stockfish-19/
- https://github.com/nmrugg/stockfish.js
- https://github.com/CSSLab/maia2
- https://github.com/CSSLab/maia3
- https://database.lichess.org/
- https://github.com/lichess-org/chess-openings
- https://database.nikonoel.fr/
- https://aclanthology.org/P18-1154/
- https://arxiv.org/pdf/2410.20811
- https://github.com/ai-chess-training/LLM-ChessCoach
- https://github.com/danglingP0inter/Chesscetera
- https://github.com/ronaldsuwandi/thinkfish
- https://github.com/jalpp/chessagine-mcp
