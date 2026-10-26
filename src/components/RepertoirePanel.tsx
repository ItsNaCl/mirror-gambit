import { useMemo, useState } from 'react'
import { ChevronRight, Plus, RotateCcw, Square, Trash2, X } from 'lucide-react'
import type { RepertoireApi } from '../hooks/useRepertoire'
import { importPgn } from '../lib/chess/pgn'
import { numberedMoves } from '../lib/coach/claudeContext'
import { movesAt, posKey, type Side } from '../lib/repertoire/repertoire'
import { allLines, openings } from '../openings'
import { HintBar } from './HintBar'

export interface RepertoirePanelProps {
  rep: RepertoireApi
  fen: string
  /** Moves of the game on the Board screen, so it can be added in one click. */
  boardSans: string[]
  onBack: () => void
  onStart: () => void
}

export function RepertoirePanel({ rep: api, fen, boardSans, onBack, onStart }: RepertoirePanelProps) {
  const { rep, stats } = api
  if (!rep) return <CreateRepertoire api={api} first />

  return (
    <div>
      <RepertoireHeader api={api} />
      {stats && (
        <p className="muted" style={{ margin: '8px 0 14px' }}>
          {stats.myMoves} of your moves · <span className={stats.due ? 'due-count' : ''}>{stats.due} due</span> · {stats.learned} learned
        </p>
      )}
      <div className="segmented" role="group" aria-label="Mode" style={{ marginBottom: 16 }}>
        {(['build', 'drill', 'gaps'] as const).map((m) => (
          <button key={m} aria-pressed={api.mode === m} onClick={() => api.setMode(m)}>
            {m === 'build' ? 'Build' : m === 'drill' ? `Drill${stats?.due ? ` (${stats.due})` : ''}` : 'Gaps'}
          </button>
        ))}
      </div>
      {api.mode === 'build' && <BuildView api={api} fen={fen} boardSans={boardSans} onBack={onBack} onStart={onStart} />}
      {api.mode === 'drill' && <DrillView api={api} />}
      {api.mode === 'gaps' && <GapsView api={api} />}
    </div>
  )
}

function RepertoireHeader({ api }: { api: RepertoireApi }) {
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rep = api.rep!
  if (creating) return <CreateRepertoire api={api} onDone={() => setCreating(false)} />
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <span className={'side-chip ' + (rep.color === 'w' ? 'white' : 'black')} title={rep.color === 'w' ? 'You play White' : 'You play Black'} />
      <select value={rep.id} onChange={(e) => api.select(e.target.value)} aria-label="Repertoire" style={{ flex: 1 }}>
        {api.reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button className="btn small icon" onClick={() => setCreating(true)} aria-label="New repertoire" title="New repertoire">
        <Plus />
      </button>
      {confirmDelete ? (
        <>
          <button className="btn small danger" onClick={() => { api.remove(rep.id); setConfirmDelete(false) }}>
            Delete
          </button>
          <button className="btn small icon" onClick={() => setConfirmDelete(false)} aria-label="Keep it">
            <X />
          </button>
        </>
      ) : (
        <button className="btn small icon" onClick={() => setConfirmDelete(true)} aria-label="Delete this repertoire" title="Delete this repertoire">
          <Trash2 />
        </button>
      )}
    </div>
  )
}

function CreateRepertoire({ api, first, onDone }: { api: RepertoireApi; first?: boolean; onDone?: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<Side>('w')
  return (
    <div>
      {first && (
        <>
          <h2>Build your opening repertoire</h2>
          <p className="muted" style={{ margin: '8px 0 16px' }}>
            Pick the moves you want to play, then drill them with spaced repetition. The app plays your opponents'
            replies, weighted towards the ones your own opponents play, and asks for your answer. Each move comes back
            just before you would forget it.
          </p>
        </>
      )}
      <form
        className="import-row"
        onSubmit={(e) => {
          e.preventDefault()
          api.create(name, color)
          onDone?.()
        }}
      >
        <div className="segmented" role="group" aria-label="Your side">
          {(['w', 'b'] as Side[]).map((c) => (
            <button key={c} type="button" aria-pressed={color === c} onClick={() => setColor(c)}>
              <span className={'side-chip ' + (c === 'w' ? 'white' : 'black')} /> {c === 'w' ? 'White' : 'Black'}
            </button>
          ))}
        </div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={color === 'w' ? 'My White repertoire' : 'My Black repertoire'} aria-label="Name" />
        <button className="btn primary" type="submit">
          Create
        </button>
        {onDone && (
          <button className="btn" type="button" onClick={onDone}>
            Cancel
          </button>
        )}
      </form>
    </div>
  )
}

function BuildView({ api, fen, boardSans, onBack, onStart }: { api: RepertoireApi; fen: string; boardSans: string[]; onBack: () => void; onStart: () => void }) {
  const rep = api.rep!
  const here = useMemo(() => movesAt(rep, posKey(fen)), [rep, fen])
  const yourTurn = fen.split(' ')[1] === rep.color
  const [openingId, setOpeningId] = useState('')
  const [pgn, setPgn] = useState('')
  const [pgnError, setPgnError] = useState<string | null>(null)
  const sideOpenings = openings.filter((o) => (o.side === 'white') === (rep.color === 'w'))

  return (
    <div>
      {api.notice && (
        <div className="card info">
          <p>{api.notice}</p>
        </div>
      )}
      <div className="panel-head" style={{ marginBottom: 6 }}>
        <h2>{yourTurn ? 'Your move here' : "Their replies here"}</h2>
        <span className="row" style={{ gap: 4 }}>
          <button className="btn small icon" onClick={onBack} aria-label="Back one move" title="Back one move (Left arrow)">
            <RotateCcw />
          </button>
          <button className="btn small" onClick={onStart}>
            Start position
          </button>
        </span>
      </div>
      {here.length === 0 ? (
        <p className="muted">
          {yourTurn
            ? 'No move chosen yet. Play the move you want on the board and it is added.'
            : 'No replies prepared yet. Play the replies you expect on the board, then your answer to each.'}
        </p>
      ) : (
        <div className="rows">
          {here.map((m) => (
            <div key={m.uci} className="row rep-row">
              <button className="move-chip" onClick={() => api.follow(m.uci)} title="Play it on the board">
                {m.san}
              </button>
              <span className="muted small-text">
                {m.mine ? (m.srs && m.srs.reps > 0 ? `next due ${new Date(m.srs.due).toLocaleDateString()}` : 'not drilled yet') : 'opponent reply'}
              </span>
              <span className="spacer" />
              <button className="btn small icon" onClick={() => api.deleteHere(m.uci)} aria-label={`Remove ${m.san} and the moves after it`} title="Remove it and the moves after it">
                <X />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-title">Add whole lines</div>
      <div className="import-row" style={{ marginBottom: 8 }}>
        <select value={openingId} onChange={(e) => setOpeningId(e.target.value)} aria-label="Built-in opening" style={{ flex: 1 }}>
          <option value="">A built-in opening…</option>
          {sideOpenings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button
          className="btn small"
          disabled={!openingId}
          onClick={() => {
            const o = openings.find((x) => x.id === openingId)
            if (!o) return
            // Trap lines show the side that falls into the trap; they must not become your moves.
            const lines = allLines(o).filter((l) => !l.isTrap)
            api.addLines(
              lines.map((l) => l.moves.map((m) => m.san)),
              o.name,
              lines.map((l) => l.name),
            )
            setOpeningId('')
          }}
        >
          Add
        </button>
      </div>
      <button className="btn small" disabled={boardSans.length === 0} onClick={() => api.addSans(boardSans, 'the game on the Board')} style={{ marginBottom: 8 }}>
        Add the game on the Board ({boardSans.length} moves)
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          try {
            const state = importPgn(pgn)
            api.addSans(state.moves.map((m) => m.san), 'the PGN')
            setPgn('')
            setPgnError(null)
          } catch (err) {
            setPgnError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="Or paste a line as PGN: 1. e4 c5 2. Nf3 d6" aria-label="PGN" style={{ minHeight: 64 }} />
        {pgnError && <p className="error-text">{pgnError}</p>}
        <button className="btn small" type="submit" disabled={!pgn.trim()} style={{ marginTop: 8 }}>
          Add the PGN line
        </button>
      </form>
    </div>
  )
}

function DrillView({ api }: { api: RepertoireApi }) {
  const f = api.feedback
  const done = f?.kind === 'done'
  const kind = f?.kind === 'wrong' || f?.kind === 'reveal' ? 'warn' : f?.kind === 'correct' || done ? 'good' : 'info'
  return (
    <div>
      {api.line.length > 0 && (
        <p className="muted" style={{ marginBottom: 10 }}>
          Move {Math.min(api.step + 1, api.line.length)} of {api.line.length}: {numberedMoves(api.line.map((s) => s.san).slice(0, api.step))}
        </p>
      )}
      {f && (
        <div className={'card ' + kind}>
          <h3>
            {f.kind === 'correct' ? 'Correct' : f.kind === 'wrong' ? 'Not quite' : f.kind === 'reveal' ? 'Here is your move' : done ? 'Line complete' : f.kind === 'nothing-due' ? 'All caught up' : 'Your move'}
          </h3>
          <p className="small-text">{f.text}</p>
          {api.userToMove && <HintBar attempt={api.attempt} hintText={api.hintText} onGiveUp={api.giveUp} giveUpLabel="Show me the move" />}
        </div>
      )}
      <div className="row">
        {(done || f?.kind === 'nothing-due') && (
          <>
            {(api.stats?.due ?? 0) > 0 && (
              <button className="btn primary" onClick={() => api.startDrill(false)}>
                Next line <ChevronRight />
              </button>
            )}
            {(api.stats?.myMoves ?? 0) > 0 && (
              <button className="btn" onClick={() => api.startDrill(true)}>
                Practise anyway
              </button>
            )}
          </>
        )}
        <button className="btn small" onClick={() => api.setMode('build')}>
          <Square /> Stop
        </button>
      </div>
    </div>
  )
}

function GapsView({ api }: { api: RepertoireApi }) {
  const rep = api.rep!
  const side = rep.color === 'w' ? 'White' : 'Black'
  return (
    <div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Replies with no prepared answer. They come from {api.replyGames} of your imported games as {side}
        {api.engineScanned ? ' and from Stockfish' : ''}. Import games in My games to see what your own opponents play.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        {api.scanning ? (
          <>
            <span className="muted">
              Asking Stockfish: {api.scanning.done} of {api.scanning.total} positions
            </span>
            <span className="spacer" />
            <button className="btn small" onClick={api.stopScan}>
              <Square /> Stop
            </button>
          </>
        ) : (
          <button className="btn small" onClick={() => void api.scanWithEngine()}>
            {api.engineScanned ? 'Ask Stockfish again' : 'Also ask Stockfish for likely replies'}
          </button>
        )}
      </div>
      {api.gaps.length === 0 ? (
        <div className="empty-state">
          <p>No gaps found{api.engineScanned ? '' : ' yet'}. Every reply we know of has an answer.</p>
        </div>
      ) : (
        <div className="rows">
          {api.gaps.slice(0, 30).map((g) => (
            <div key={`${g.pos}-${g.uci}`} className="row rep-row">
              <span className="mono small-text gap-line">
                {numberedMoves([...g.line, g.san])}
              </span>
              <span className="muted small-text">{g.played ? `played ${g.played}×` : 'engine'}</span>
              <span className="spacer" />
              <button className="btn small" onClick={() => api.openGap(g)}>
                Answer it
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
