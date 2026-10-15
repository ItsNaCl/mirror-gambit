import { useRef, useState } from 'react'
import type { SrsApi } from '../hooks/useSrs'
import type { SrsCard } from '../lib/srs/srs'
import { HintBar } from './HintBar'

function hoursUntil(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'now'
  const h = ms / 3600000
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} d`
}

export interface SrsPanelProps {
  srs: SrsApi
  notify: (title: string, kind?: 'good' | 'warn' | 'bad' | 'info') => void
}

export function SrsPanel({ srs, notify }: SrsPanelProps) {
  if (srs.session) return <ReviewSession srs={srs} />
  return <Deck srs={srs} notify={notify} />
}

function Deck({ srs, notify }: SrsPanelProps) {
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [showAll, setShowAll] = useState(false)
  const upcoming = [...srs.cards].sort((a, b) => Date.parse(a.nextReview) - Date.parse(b.nextReview))

  function download() {
    const blob = new Blob([srs.exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mirror-gambit-cards-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    try {
      const added = srs.importJson(await file.text())
      notify(`Imported ${added} new card${added === 1 ? '' : 's'}`, 'good')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not import that file', 'bad')
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Mistake review</h3>
        <button className="btn primary" onClick={srs.startReview} disabled={srs.dueCount === 0}>
          {srs.dueCount === 0 ? 'Nothing due' : `Review ${srs.dueCount} due`}
        </button>
      </div>
      <p className="small-text muted">
        Every inaccuracy, mistake or blunder from a game review becomes a card: the position before your move. You find
        the best move with as many tries as you need; the card comes back after 4 hours, then 1 day, 3 days, 1 week,
        2 weeks and a month. Giving up or needing the bigger hints sends it back to 4 hours.
      </p>

      <div className="section-title">
        Deck · {srs.cards.length} card{srs.cards.length === 1 ? '' : 's'}, {srs.dueCount} due
      </div>
      {srs.cards.length === 0 ? (
        <p className="small-text muted">No cards yet. Review a game, or press "Save for review" on a blunder alert, or "Save this position" under the board.</p>
      ) : (
        <div className="lines">
          {(showAll ? upcoming : upcoming.slice(0, 8)).map((c) => (
            <CardRow key={c.id} card={c} onRemove={() => srs.removeCard(c.id)} />
          ))}
          {upcoming.length > 8 && (
            <button className="btn small" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${upcoming.length}`}
            </button>
          )}
        </div>
      )}

      <div className="section-title">Backup</div>
      <div className="row">
        <button className="btn small" onClick={download} disabled={srs.cards.length === 0}>
          Export cards (JSON)
        </button>
        <button className="btn small" onClick={() => fileInput.current?.click()}>
          Import cards
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            void onImportFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <p className="small-text muted">Cards live in this browser's storage. Export them now and then so clearing browser data does not lose them.</p>
    </div>
  )
}

function CardRow({ card, onRemove }: { card: SrsCard; onRemove: () => void }) {
  const side = card.fen.split(' ')[1] === 'b' ? 'Black' : 'White'
  return (
    <div className="line">
      <span className={`score cls-${card.classification}`} style={{ minWidth: 70, fontSize: 12 }}>
        {card.classification}
      </span>
      <span className="pv small-text">
        {side} to move{card.playerMove ? `, you played ${card.playerMove}` : ''}. Ease {card.easeFactor.toFixed(2)}, step {card.repetitions}.
      </span>
      <span className="depth">due {hoursUntil(card.nextReview)}</span>
      <button className="btn small" onClick={onRemove} title="Delete this card">
        ✕
      </button>
    </div>
  )
}

function ReviewSession({ srs }: { srs: SrsApi }) {
  const s = srs.session!
  const side = s.card.fen.split(' ')[1] === 'b' ? 'Black' : 'White'
  const done = s.status !== 'asking'
  const kind = s.status === 'solved' ? (s.outcome === 'clean' ? 'good' : 'info') : s.status === 'revealed' ? 'bad' : s.message ? 'warn' : 'info'
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn small" onClick={srs.exit}>
          ← Deck
        </button>
        <span className="small-text muted">{srs.dueCount} due</span>
      </div>
      <div className={'card ' + kind}>
        <h3>
          {s.status === 'solved'
            ? `✓ ${s.outcome === 'clean' ? 'Clean' : 'Assisted'} (grade ${s.grade}/5)`
            : s.status === 'revealed'
              ? 'Failed (grade 0/5)'
              : `What is the best move for ${side}?`}
        </h3>
        {s.message ? <p className="small-text">{s.message}</p> : <p className="small-text muted">Play it on the board. Take as many tries as you need.</p>}
        {!done && <HintBar attempt={srs.attempt} hintText={srs.hintText} onGiveUp={srs.giveUp} />}
        {done && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={srs.nextCard}>
              {srs.due.some((c) => c.id !== s.card.id) ? 'Next card ▶' : 'Finish'}
            </button>
          </div>
        )}
      </div>
      {s.card.playerMove && !done && (
        <p className="small-text muted">
          In the game you played {s.card.playerMove}, which was a {s.card.classification}. Grades: clean 5, retries only 4, hint 1-2 is 3, hint 3-4 is 2,
          give up 0.
        </p>
      )}
    </div>
  )
}
