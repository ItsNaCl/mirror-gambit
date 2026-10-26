import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import type { PuzzlesApi } from '../hooks/usePuzzles'
import type { RatedPuzzlesApi } from '../hooks/useRatedPuzzles'
import { PROVISIONAL_GAMES, THEME_FILTERS, type ThemeFilter } from '../lib/puzzles/rated'
import { OUTCOME_LABEL, solvedCount } from '../lib/practice/practice'
import { loadPuzzles, motifGuide, PUZZLE_SETS, puzzlesFor, type PuzzleChoice } from '../lib/puzzles/puzzles'
import { HintBar } from './HintBar'

export function PuzzlesPanel({ puzzles, rated }: { puzzles: PuzzlesApi; rated?: RatedPuzzlesApi }) {
  if (!puzzles.active)
    return (
      <>
        {rated && <RatedCard rated={rated} />}
        <PuzzleSetList puzzles={puzzles} />
      </>
    )
  return <PuzzlePlay puzzles={puzzles} rated={rated?.active ? rated : undefined} />
}

/** Your puzzle rating and the way into rated puzzles. */
function RatedCard({ rated }: { rated: RatedPuzzlesApi }) {
  return (
    <section className="rated-card">
      <div className="panel-head" style={{ marginBottom: 4 }}>
        <h2>Rated puzzles</h2>
        <span className="rated-number tabular">{rated.rating}</span>
      </div>
      <p className="muted small-text" style={{ marginBottom: 12 }}>
        {rated.provisional
          ? `Provisional: ${rated.games} of ${PROVISIONAL_GAMES} puzzles played. It settles as you play.`
          : `${rated.games} rated puzzles played.`}{' '}
        Puzzles come from real Lichess games, picked near your rating. A clean solve raises it, retries or hints count half, giving up lowers it.
      </p>
      <div className="import-row">
        <select value={rated.theme} onChange={(e) => rated.setTheme(e.target.value as ThemeFilter)} aria-label="Theme" style={{ flex: 1 }}>
          {THEME_FILTERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={() => void rated.next()} disabled={rated.loading}>
          {rated.loading ? 'Loading' : 'Start'}
        </button>
      </div>
    </section>
  )
}

function PuzzleSetList({ puzzles }: { puzzles: PuzzlesApi }) {
  const { dropped } = loadPuzzles()
  const choices: { id: PuzzleChoice; label: string; count: number }[] = [
    ...PUZZLE_SETS.map((s) => ({ id: s.id, label: s.label, count: puzzlesFor(s.id).length })),
    { id: 'mixed', label: 'Mixed (all sets)', count: puzzlesFor('mixed').length },
  ]
  return (
    <div>
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Pick a set. The board turns to face the side to move; you find the moves and the app plays the replies. Take as
        many tries as you need. Hints only appear when you ask, and Give up shows the solution move by move.
      </p>
      <div className="opening-list">
        {choices.map((c) => {
          const s = c.id !== 'mixed' ? puzzles.stats[c.id] : undefined
          const total = s ? solvedCount(s) + s.failed : 0
          const rate = s && total > 0 ? `${s.clean} clean · ${s.assisted} assisted · ${s.failed} failed · streak ${s.streak}` : 'not tried yet'
          const failed = puzzles.failedPuzzles(c.id).length
          return (
            <div key={c.id} className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
              <button className="opening-item" onClick={() => puzzles.start(c.id)}>
                <span className="name">{c.label}</span>
                <span className="rate">{c.id === 'mixed' ? `${c.count} puzzles` : rate}</span>
              </button>
              {failed > 0 && (
                <button
                  className="btn small"
                  onClick={() => puzzles.retryFailed(c.id, c.label)}
                  title="Play only the puzzles you gave up on"
                  style={{ flexShrink: 0 }}
                >
                  Retry failed ({failed})
                </button>
              )}
            </div>
          )
        })}
      </div>
      {dropped.length > 0 && (
        <p className="small-text muted" style={{ marginTop: 10 }}>
          {dropped.length} puzzle{dropped.length === 1 ? '' : 's'} failed validation and {dropped.length === 1 ? 'was' : 'were'} left out.
        </p>
      )}
    </div>
  )
}

export function PuzzlePlay({ puzzles, rated }: { puzzles: PuzzlesApi; rated?: RatedPuzzlesApi }) {
  const p = puzzles.puzzle!
  const guide = motifGuide(p.motif)
  const setLabel = rated
    ? `Rated ${p.difficulty}`
    : puzzles.choice === 'custom'
      ? puzzles.label
      : (PUZZLE_SETS.find((s) => s.id === p.set)?.label ?? p.set)
  const onNext = rated ? () => void rated.next() : puzzles.next
  const stats = puzzles.stats[p.set]
  const done = puzzles.status === 'solved' || puzzles.status === 'revealing'
  const sideName = p.side === 'w' ? 'White' : 'Black'
  const yourMoves = Math.ceil(p.solution.length / 2)
  const moveNo = Math.floor(puzzles.step / 2) + 1

  const cardKind =
    puzzles.status === 'solved' ? (puzzles.outcome === 'clean' ? 'good' : 'info') : puzzles.status === 'revealing' ? 'bad' : puzzles.message?.startsWith('Not') ? 'warn' : 'info'

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn small" onClick={puzzles.exit}>
          <ChevronLeft /> {puzzles.choice === 'custom' ? 'Back' : 'Puzzle sets'}
        </button>
        <span className="small-text muted">
          {setLabel} · {sideName} to move
          {stats ? ` · streak ${stats.streak}` : ''}
        </span>
      </div>

      <div className={'card ' + cardKind}>
        {puzzles.status === 'playing' && (
          <>
            <h3>
              Find the best move for {sideName}
              {yourMoves > 1 ? ` (move ${Math.min(moveNo, yourMoves)} of ${yourMoves})` : ''}
            </h3>
            <p className="small-text">
              {puzzles.message ?? (puzzles.solverToMove ? 'Your move. Play it on the board.' : 'The app is replying…')}
            </p>
            <HintBar attempt={puzzles.attempt} hintText={puzzles.hintText} onGiveUp={puzzles.giveUp} />
          </>
        )}

        {puzzles.status === 'solved' && (
          <>
            <h3>
              {puzzles.outcome === 'clean' ? 'Solved clean' : 'Solved with help'}
            </h3>
            <p className="small-text">
              {puzzles.outcome === 'clean'
                ? 'No hints and no wrong tries. Nicely done.'
                : `You got there with ${puzzles.attempt.totalWrong} wrong ${puzzles.attempt.totalWrong === 1 ? 'try' : 'tries'}${
                    puzzles.attempt.maxHint ? ` and hints up to level ${puzzles.attempt.maxHint}` : ''
                  }. Try it again later for a clean solve.`}
            </p>
          </>
        )}

        {puzzles.status === 'revealing' && (
          <>
            <h3>Solution ({OUTCOME_LABEL.failed})</h3>
            <p className="small-text">
              {puzzles.revealDone
                ? `That is the whole solution: ${p.solutionSan.join(' ')}.`
                : 'The arrow shows the next solution move. Press "Show next move" to play it.'}
            </p>
            {!puzzles.revealDone && (
              <button className="btn small primary" onClick={puzzles.revealNext}>
                Show next move <ChevronRight />
              </button>
            )}
          </>
        )}

        {done && rated && rated.lastDelta !== null && (
          <p className="rated-delta">
            Your rating: <strong className="tabular">{rated.rating}</strong>{' '}
            <span className={rated.lastDelta > 0 ? 'cls-good' : rated.lastDelta < 0 ? 'cls-blunder' : 'muted'}>
              ({rated.lastDelta > 0 ? '+' : ''}
              {rated.lastDelta})
            </span>
          </p>
        )}
        {done && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={onNext}>
              Next puzzle <ChevronRight />
            </button>
            {!rated && (
              <button className="btn" onClick={puzzles.retry} title="Play the same puzzle again from the start">
                <RotateCcw /> Retry puzzle
              </button>
            )}
          </div>
        )}
        {puzzles.status === 'playing' && !rated && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={puzzles.next} title="Move on without recording a result">
              Skip
            </button>
          </div>
        )}
      </div>

      <div className="section-title">{guide.title}</div>
      <div className="card">
        <p className="small-text" style={{ margin: 0 }}>
          {done ? guide.after : guide.before}
        </p>
      </div>
      {done && p.explanation && (
        <div className="card">
          <h3>About this puzzle</h3>
          <p className="small-text" style={{ margin: 0 }}>
            {p.explanation}
          </p>
          {puzzles.status === 'solved' && (
            <p className="small-text muted" style={{ margin: '6px 0 0' }}>
              Solution: {p.solutionSan.join(' ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
