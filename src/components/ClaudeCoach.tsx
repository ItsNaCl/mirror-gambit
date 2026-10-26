import { useEffect, useRef, useState } from 'react'
import { MessageCircleQuestion, Send } from 'lucide-react'
import type { ClaudeCoachApi } from '../hooks/useClaudeCoach'
import type { CoachMode } from '../lib/coach/claudeContext'
import { costOf, formatDollars } from '../lib/coach/usage'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  /** What the student sees for their own turn ("Explain this position"), not the full context. */
  shown?: string
  cost?: number
}

export interface ClaudeCoachProps {
  coach: ClaudeCoachApi
  /** Changes when the position changes; the conversation starts over. */
  positionKey: string
  /** The position as text for Claude, for a given kind of question. */
  context: (mode: CoachMode) => string
  /** Quick actions shown as buttons. */
  actions: { mode: CoachMode; label: string }[]
  onOpenSettings: () => void
}

const MAX_HISTORY = 10

/**
 * Ask Claude about the position on the board. Nothing is sent until a button is pressed, and
 * each answer shows what it cost. Follow-up questions keep the conversation until the position
 * changes.
 */
export function ClaudeCoach({ coach, positionKey, context, actions, onOpenSettings }: ClaudeCoachProps) {
  const [turns, setTurns] = useState<Turn[]>([])
  // The position as sent with the first question; follow-ups resend it so Claude keeps the facts.
  const [firstContext, setFirstContext] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  useEffect(() => {
    request.current++
    setTurns([])
    setFirstContext(null)
    setError(null)
    setBusy(false)
  }, [positionKey])

  if (!coach.available) return null

  if (!coach.ready) {
    return (
      <section className="claude-coach" aria-label="Ask Claude">
        <div className="panel-head" style={{ marginBottom: 6 }}>
          <h2>Ask Claude</h2>
        </div>
        <p className="muted">
          Add a Claude API key to ask a coach about any position in your own words.{' '}
          <button className="link-btn" onClick={onOpenSettings}>
            Set it up in Settings
          </button>
        </p>
      </section>
    )
  }

  async function send(mode: CoachMode, label: string, q?: string) {
    const id = ++request.current
    setBusy(true)
    setError(null)
    const isFirst = firstContext === null
    // First question: the context carries the task and the question. Follow-ups: the same context,
    // then every turn after it, then the new question.
    const ctx = isFirst ? context(mode) + (q ? `\n\nQuestion: ${q}` : '') : firstContext
    const history = turns.slice(1).slice(-MAX_HISTORY).map((t) => ({ role: t.role, text: t.text }))
    const userTurn: Turn = { role: 'user', text: q ?? label, shown: label }
    const answer = await coach.ask({ mode: isFirst ? mode : 'question', context: ctx, question: isFirst ? undefined : q, history: isFirst ? undefined : history })
    if (id !== request.current) return
    setBusy(false)
    if (!answer.ok) {
      setError(answer.error)
      return
    }
    if (isFirst) setFirstContext(ctx)
    setTurns((prev) => [...(isFirst ? [] : prev), userTurn, { role: 'assistant', text: answer.text, cost: costOf(answer.model, answer.usage) }])
    setQuestion('')
  }

  const spent = coach.usage ? `${formatDollars(coach.usage.dollars)} this month` : 'Nothing spent this month'

  return (
    <section className="claude-coach" aria-label="Ask Claude">
      <div className="panel-head" style={{ marginBottom: 8 }}>
        <h2>Ask Claude</h2>
        <span className="faint small-text" title={coach.monthlyCap ? `Limit ${formatDollars(coach.monthlyCap)} a month` : 'No monthly limit set'}>
          {spent}
        </span>
      </div>

      {turns.length > 0 && (
        <div className="thread" aria-live="polite">
          {turns.map((t, i) =>
            t.role === 'user' ? (
              <p key={i} className="thread-q">
                {t.shown ?? t.text}
              </p>
            ) : (
              <div key={i} className="thread-a">
                {t.text.split(/\n{2,}/).map((para, j) => (
                  <p key={j}>{para}</p>
                ))}
                {t.cost !== undefined && <span className="faint small-text">about {formatDollars(t.cost)}</span>}
              </div>
            ),
          )}
        </div>
      )}

      {busy && <p className="muted thinking">The coach is thinking</p>}
      {error && <p className="error-text">{error}</p>}
      {coach.overCap && <p className="muted">This month’s limit is reached. You can raise it in Settings.</p>}

      {turns.length === 0 && (
        <div className="row" style={{ marginBottom: 10 }}>
          {actions.map((a) => (
            <button key={a.mode} className="btn small" disabled={busy || coach.overCap} onClick={() => void send(a.mode, a.label)}>
              <MessageCircleQuestion /> {a.label}
            </button>
          ))}
        </div>
      )}

      <form
        className="ask-row"
        onSubmit={(e) => {
          e.preventDefault()
          const q = question.trim()
          if (q) void send('question', q, q)
        }}
      >
        <input
          type="text"
          value={question}
          maxLength={600}
          placeholder={turns.length ? 'Ask a follow-up' : 'Ask anything about this position'}
          aria-label="Your question for the coach"
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy || coach.overCap}
        />
        <button className="btn small icon" type="submit" disabled={busy || coach.overCap || !question.trim()} aria-label="Ask">
          <Send />
        </button>
      </form>
    </section>
  )
}
