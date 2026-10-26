import { useState } from 'react'
import { Download, Play, Square } from 'lucide-react'
import type { LibraryApi } from '../hooks/useLibrary'
import { BATCH_DEPTH } from '../hooks/useLibrary'
import { outcome, TAG_LABEL, type Phase } from '../lib/games/profile'
import type { GameSource, LibraryGame } from '../lib/games/sources'

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }
const SOURCE_LABEL: Record<GameSource, string> = { lichess: 'Lichess', chesscom: 'chess.com' }
const COUNTS = [10, 25, 50, 100]

export interface MyGamesPanelProps {
  library: LibraryApi
  engineReady: boolean
  /** Opens a game in Game review, at a move when given. */
  onOpen: (game: LibraryGame, ply?: number) => void
}

export function MyGamesPanel({ library, engineReady, onOpen }: MyGamesPanelProps) {
  const { games, analyses, profile, progress, pending } = library
  const byId = new Map(games.map((g) => [g.id, g]))

  return (
    <div className="page">
      <p className="lead">
        {profile
          ? profile.finding
          : games.length
            ? 'Review your games to see where your points go.'
            : 'Import your recent games from Lichess or chess.com, and the review will show where your points go.'}
      </p>

      <ImportPanel library={library} />

      {(pending > 0 || progress) && (
        <section className="panel panel-body batch" aria-live="polite">
          {progress ? (
            <>
              <div className="row">
                <span>
                  Reviewing game {progress.done + 1} of {progress.total}
                  {progress.current ? `: ${progress.current.white} vs ${progress.current.black}` : ''} (position {progress.position} of{' '}
                  {progress.positions})
                </span>
                <span className="spacer" />
                <button className="btn small" onClick={library.cancel}>
                  <Square /> Stop
                </button>
              </div>
              <div className="progress" style={{ marginTop: 10 }}>
                <div style={{ width: `${Math.round(((progress.done + progress.position / progress.positions) / progress.total) * 100)}%` }} />
              </div>
              <p className="faint small-text" style={{ marginTop: 8 }}>
                Keep this page open while it runs. Each finished game is saved, so you can stop at any time.
              </p>
            </>
          ) : (
            <div className="row">
              <span>
                {pending} game{pending === 1 ? '' : 's'} not reviewed yet. A quick review (depth {BATCH_DEPTH}) takes about 15 seconds a game.
              </span>
              <span className="spacer" />
              <button className="btn small primary" onClick={() => void library.reviewPending()} disabled={!engineReady}>
                <Play /> Review {pending === 1 ? 'it' : 'them'}
              </button>
            </div>
          )}
        </section>
      )}

      {profile && (
        <>
          <div className="figures" role="list">
            <Figure label="Games reviewed" value={String(profile.games)} caption={`${profile.wins} won, ${profile.draws} drawn, ${profile.losses} lost`} />
            <Figure
              label="Score"
              value={String(Math.round((100 * (profile.wins + profile.draws / 2)) / profile.games))}
              unit="%"
              caption="Win 1, draw half a point"
            />
            <Figure label="Your accuracy" value={String(profile.accuracy)} unit="%" caption="Best, great or good moves" />
            <Figure label="Blunders a game" value={profile.blundersPerGame.toFixed(1)} caption="Moves that lost 3 pawns or more" />
          </div>

          <div className="page-grid">
            <section className="panel span-5 panel-body">
              <div className="panel-head">
                <h2>Where the points go</h2>
              </div>
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Mistakes a game</th>
                    <th>Blunders</th>
                    <th>Avg. loss</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.phases.map((p) => (
                    <tr key={p.phase}>
                      <td>{PHASE_LABEL[p.phase]}</td>
                      <td className={p.perGame ? '' : 'zero'}>{p.perGame.toFixed(1)}</td>
                      <td className={p.blunders ? '' : 'zero'}>{p.blunders}</td>
                      <td className={p.avgLoss ? '' : 'zero'}>{p.avgLoss ? `${p.avgLoss.toFixed(1)} pawns` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="panel span-7 panel-body">
              <div className="panel-head">
                <h2>What goes wrong</h2>
                <span className="faint small-text">Click a move to see it</span>
              </div>
              {profile.tags.length === 0 ? (
                <p className="muted">No inaccuracies, mistakes or blunders in these games.</p>
              ) : (
                <div className="rows">
                  {profile.tags.map((t) => (
                    <div className="tag-row" key={t.tag}>
                      <span className="tag-name">{TAG_LABEL[t.tag]}</span>
                      <span className="tabular tag-count">{t.count}</span>
                      <span className="tag-examples">
                        {t.examples.map((ex) => {
                          const g = byId.get(ex.gameId)
                          return g ? (
                            <button key={`${ex.gameId}-${ex.ply}`} className="move-chip" onClick={() => onOpen(g, ex.ply)} title={`${g.white} vs ${g.black}`}>
                              {ex.san}
                            </button>
                          ) : null
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel span-12 panel-body">
              <div className="panel-head">
                <h2>Your openings</h2>
                <span className="faint small-text">Most played first</span>
              </div>
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>Opening</th>
                    <th>Your side</th>
                    <th>Games</th>
                    <th>Score</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.openings.slice(0, 10).map((o) => (
                    <tr key={`${o.name}-${o.color}`}>
                      <td>{o.name}</td>
                      <td>
                        <span className={'side-chip ' + (o.color === 'w' ? 'white' : 'black')} /> {o.color === 'w' ? 'White' : 'Black'}
                      </td>
                      <td>{o.games}</td>
                      <td className={o.score < 40 ? 'cls-mistake' : o.score >= 60 ? 'cls-good' : ''}>{o.score}%</td>
                      <td>{o.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}

      {games.length > 0 && (
        <section className="panel panel-body">
          <div className="panel-head">
            <h2>Games</h2>
            <span className="faint small-text">{games.length} imported, newest first</span>
          </div>
          <table className="summary-table games-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>Opening</th>
                <th>Accuracy</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {games.slice(0, 100).map((g) => {
                const a = analyses[g.id]
                const r = outcome(g)
                return (
                  <tr key={g.id}>
                    <td>{new Date(g.date).toLocaleDateString()}</td>
                    <td>
                      <span className={'side-chip ' + (g.userColor === 'w' ? 'white' : 'black')} title={`You played ${g.userColor === 'w' ? 'White' : 'Black'}`} />{' '}
                      {g.userColor === 'w' ? g.black : g.white}
                    </td>
                    <td className={r === 'win' ? 'outcome-win' : r === 'loss' ? 'outcome-loss' : 'outcome-draw'}>{r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : 'Draw'}</td>
                    <td className="truncate-cell">{g.opening ?? '–'}</td>
                    <td className={a ? '' : 'zero'}>{a ? `${a.accuracy}%` : 'Not reviewed'}</td>
                    <td>
                      <button className="btn small" onClick={() => onOpen(g)} disabled={!engineReady || !!progress}>
                        Review
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="faint small-text">Games and their reviews are saved on this computer.</span>
            <span className="spacer" />
            <button className="btn small danger" onClick={library.removeAll} disabled={!!progress}>
              Remove all imported games
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function ImportPanel({ library }: { library: LibraryApi }) {
  const [source, setSource] = useState<GameSource>(library.account?.source ?? 'lichess')
  const [username, setUsername] = useState(library.account?.username ?? '')
  const [count, setCount] = useState(25)
  const [message, setMessage] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null)

  async function run() {
    setMessage(null)
    try {
      const { added, found } = await library.importGames(source, username, count)
      setMessage({
        kind: 'good',
        text:
          found === 0
            ? `No standard games found for ${username} on ${SOURCE_LABEL[source]}.`
            : added === 0
              ? `Your ${found} most recent games were already here.`
              : `Imported ${added} new game${added === 1 ? '' : 's'} from ${SOURCE_LABEL[source]}.`,
      })
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <section className="panel panel-body">
      <div className="panel-head">
        <h2>Import your games</h2>
      </div>
      <form
        className="import-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (username.trim()) void run()
        }}
      >
        <div className="segmented" role="group" aria-label="Site">
          {(['lichess', 'chesscom'] as GameSource[]).map((s) => (
            <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)}>
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={`Your ${SOURCE_LABEL[source]} username`}
          aria-label="Username"
          autoComplete="off"
          spellCheck={false}
        />
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many games">
          {COUNTS.map((c) => (
            <option key={c} value={c}>
              Last {c} games
            </option>
          ))}
        </select>
        <button className="btn primary" type="submit" disabled={!username.trim() || library.importing}>
          <Download /> {library.importing ? 'Importing' : 'Import'}
        </button>
      </form>
      {message && (
        <p className={message.kind === 'bad' ? 'error-text' : 'muted'} style={{ marginTop: 10 }}>
          {message.text}
        </p>
      )}
    </section>
  )
}

function Figure({ label, value, unit, caption }: { label: string; value: string; unit?: string; caption: string }) {
  return (
    <div className="figure" role="listitem">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="caption">{caption}</div>
    </div>
  )
}
