import type { PuzzlesApi } from '../hooks/usePuzzles'
import type { TrainerApi } from '../hooks/useTrainer'
import { GROUP_LABELS, openings, type Opening, type OpeningGroup } from '../openings'
import { trapPuzzlesFor } from '../openings/trapPuzzles'
import { Glossed } from './Glossary'
import { HintBar } from './HintBar'
import { PuzzlePlay } from './PuzzlesPanel'

const GROUP_ORDER: OpeningGroup[] = ['white', 'black-vs-e4', 'black-vs-d4', 'trap-line']

export function OpeningsPanel({ trainer, puzzles }: { trainer: TrainerApi; puzzles: PuzzlesApi }) {
  if (!trainer.opening) return <OpeningList trainer={trainer} />
  return <OpeningDetail trainer={trainer} opening={trainer.opening} puzzles={puzzles} />
}

function OpeningList({ trainer }: { trainer: TrainerApi }) {
  return (
    <div>
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Pick an opening to step through it with explanations, watch it play, or drill it from memory. Your drill
        success rate is saved on this computer.
      </p>
      {GROUP_ORDER.map((group) => (
        <div key={group}>
          <div className="section-title">{GROUP_LABELS[group]}</div>
          <div className="opening-list">
            {openings
              .filter((o) => o.group === group)
              .map((o) => {
                const s = trainer.stats[o.id]
                const rate = s && s.attempts > 0 ? `${Math.round((100 * s.correct) / s.attempts)}% of ${s.attempts}` : 'not drilled yet'
                return (
                  <button key={o.id} className="opening-item" onClick={() => trainer.select(o)}>
                    <span className="name">{o.name}</span>
                    <span className="rate" title="Drill success rate">
                      {rate}
                    </span>
                    <span className="small-text muted">{o.side === 'white' ? '♔' : '♚'}</span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}

function OpeningDetail({ trainer, opening, puzzles }: { trainer: TrainerApi; opening: Opening; puzzles: PuzzlesApi }) {
  const { mode, index, moves, currentMove, feedback } = trainer
  const atEnd = index >= moves.length
  const trapPuzzles = trapPuzzlesFor(opening.id)
  const trapsRunning = puzzles.active && puzzles.choice === 'custom'
  const startTraps = () => puzzles.startList(trapPuzzles, `${opening.name}: traps`)
  const moveNumberText = (i: number) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'}`

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn small" onClick={trainer.exit}>
          ← All openings
        </button>
        <span className="small-text muted">You play {opening.side === 'white' ? 'White' : 'Black'}</span>
      </div>
      <h3 style={{ margin: '4px 0' }}>{opening.name}</h3>
      <p className="small-text muted" style={{ marginTop: 0 }}>
        {opening.summary}
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <select value={trainer.lineKey} onChange={(e) => trainer.setLine(e.target.value)} style={{ flex: 1 }}>
          {trainer.lines.map((l) => (
            <option key={l.key} value={l.key}>
              {l.isTrap ? 'Trap: ' : l.key === 'main' ? 'Main line: ' : 'Sideline: '}
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="mode-switch">
          <button className={mode === 'step' ? 'active' : ''} onClick={() => trainer.setMode('step')}>
            Step through
          </button>
          <button className={mode === 'auto' ? 'active' : ''} onClick={() => trainer.setMode('auto')}>
            Autoplay
          </button>
          <button className={mode === 'drill' ? 'active' : ''} onClick={() => { puzzles.exit(); trainer.setMode('drill') }}>
            Drill
          </button>
          {trapPuzzles.length > 0 && (
            <button className={trapsRunning ? 'active' : ''} onClick={startTraps} title="Trap positions from this opening, as puzzles">
              Traps ({trapPuzzles.length})
            </button>
          )}
        </div>
      </div>

      {trapsRunning && (
        <div style={{ marginBottom: 12 }}>
          <PuzzlePlay puzzles={puzzles} />
        </div>
      )}

      {!trapsRunning && mode === 'step' && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn" onClick={trainer.prev} disabled={index === 0}>
              ◀ Prev
            </button>
            {atEnd && trapPuzzles.length > 0 ? (
              <button className="btn primary" onClick={startTraps}>
                Traps step ▶
              </button>
            ) : (
              <button className="btn primary" onClick={trainer.next} disabled={atEnd}>
                Next ▶
              </button>
            )}
            <span className="small-text muted">
              Move {index} of {moves.length}
            </span>
          </div>
          <Commentary move={currentMove} index={index} label={moveNumberText} start={index === 0} />
        </>
      )}

      {!trapsRunning && mode === 'auto' && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            {trainer.playing ? (
              <button className="btn primary" onClick={trainer.pause}>
                ⏸ Pause
              </button>
            ) : (
              <button className="btn primary" onClick={trainer.play}>
                ▶ {atEnd ? 'Replay' : index === 0 ? 'Play' : 'Resume'}
              </button>
            )}
            <button className="btn" onClick={() => trainer.goTo(0)} disabled={index === 0}>
              ↺ Restart
            </button>
            <span className="small-text muted">
              Move {index} of {moves.length}
            </span>
          </div>
          <div className="field">
            <label>Speed: {(trainer.speedMs / 1000).toFixed(1)}s per move</label>
            <input
              type="range"
              min={400}
              max={4000}
              step={100}
              value={trainer.speedMs}
              onChange={(e) => trainer.setSpeedMs(Number(e.target.value))}
            />
          </div>
          <Commentary move={currentMove} index={index} label={moveNumberText} start={index === 0} />
        </>
      )}

      {!trapsRunning && mode === 'drill' && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="small-text muted">Your side:</span>
            <button
              className={'btn small' + (trainer.drillSide === 'white' ? ' active' : '')}
              onClick={() => trainer.startDrill('white')}
            >
              ♔ White
            </button>
            <button
              className={'btn small' + (trainer.drillSide === 'black' ? ' active' : '')}
              onClick={() => trainer.startDrill('black')}
            >
              ♚ Black
            </button>
            <button className="btn small" onClick={() => trainer.startDrill(trainer.drillSide)}>
              ↺ Restart
            </button>
          </div>
          <div className="small-text muted" style={{ marginBottom: 8 }}>
            Progress: move {index} of {moves.length} · {trainer.drillScore.correct}/{trainer.drillScore.attempts} correct this run
          </div>
          <div
            className={
              'card ' +
              (feedback?.kind === 'wrong' || feedback?.kind === 'reveal'
                ? 'warn'
                : feedback?.kind === 'correct' || feedback?.kind === 'done'
                  ? 'good'
                  : 'info')
            }
          >
            <h3>
              {feedback?.kind === 'wrong'
                ? 'Not quite'
                : feedback?.kind === 'reveal'
                  ? 'Here is the move'
                  : feedback?.kind === 'correct'
                    ? 'Correct!'
                    : feedback?.kind === 'done'
                      ? 'Line complete'
                      : 'Drill'}
            </h3>
            <p className="small-text">{feedback ? <Glossed text={feedback.text} /> : 'Pick your side to begin.'}</p>
            {trainer.userToMove && feedback?.kind !== 'wrong' && (
              <p className="small-text muted" style={{ margin: 0 }}>
                Your move. Play it on the board.
              </p>
            )}
            {trainer.userToMove && (
              <HintBar attempt={trainer.attempt} hintText={trainer.hintText} onGiveUp={trainer.giveUp} giveUpLabel="Show me the move" />
            )}
          </div>
        </>
      )}

      <div className="section-title">Key ideas</div>
      <ul className="small-text" style={{ paddingLeft: 18, margin: '0 0 8px' }}>
        {opening.keyIdeas.map((idea, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            <Glossed text={idea} />
          </li>
        ))}
      </ul>

      <div className="section-title">Trap to watch for</div>
      <div className="card">
        <h3>{opening.trap.name}</h3>
        <p className="small-text">
          <Glossed text={opening.trap.description} />
        </p>
        {trainer.lineKey !== 'trap' && (
          <button className="btn small" onClick={() => trainer.setLine('trap')}>
            Step through the trap
          </button>
        )}
      </div>
    </div>
  )
}

function Commentary({
  move,
  index,
  label,
  start,
}: {
  move: { san: string; comment: string } | null
  index: number
  label: (i: number) => string
  start: boolean
}) {
  if (start || !move) {
    return (
      <div className="commentary">
        <div className="san">Starting position</div>
        <div className="small-text muted">Press Next to see the first move and why it is played.</div>
      </div>
    )
  }
  return (
    <div className="commentary">
      <div className="san">
        {label(index - 1)} {move.san}
      </div>
      <div className="small-text">
        <Glossed text={move.comment} />
      </div>
    </div>
  )
}
