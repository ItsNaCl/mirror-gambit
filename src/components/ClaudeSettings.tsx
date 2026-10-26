import { useState } from 'react'
import type { ClaudeCoachApi } from '../hooks/useClaudeCoach'
import { useSettings, type Settings } from '../hooks/useSettings'
import { formatDollars, MODEL_LABEL, PRICES } from '../lib/coach/usage'
import type { CoachModel } from '../lib/desktop'

const CAPS: Settings['claudeMonthlyCap'][] = [0, 1, 5, 10, 20]

/** Rows for the Claude coach section of Settings: key, model, monthly limit and spend. */
export function ClaudeSettings({ coach }: { coach: ClaudeCoachApi }) {
  const { settings, update } = useSettings()
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  if (!coach.available) {
    return (
      <div className="setting-row">
        <div>
          <div className="label">Desktop app only</div>
          <div className="desc">The Claude coach keeps your API key in the Windows app's secure store, so it is not offered in the browser.</div>
        </div>
      </div>
    )
  }

  const status = coach.status

  async function save() {
    setSaving(true)
    const r = await coach.setKey(key)
    setSaving(false)
    setKey('')
    setMessage(r.ok ? { kind: 'good', text: 'Key saved. Ask Claude from the Board or Game review screen.' } : { kind: 'bad', text: r.error ?? 'Could not save the key.' })
  }

  return (
    <>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="claude-key">
            API key {coach.ready && <span className="pill pos" style={{ marginLeft: 6 }}>Saved</span>}
          </label>
          <div className="desc">
            Create one at console.anthropic.com. It is encrypted with Windows' own key store and only ever sent to Anthropic,
            when you press a coach button.
          </div>
          <form
            className="ask-row"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (key.trim()) void save()
            }}
          >
            <input
              id="claude-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={coach.ready ? 'Paste a new key to replace it' : 'sk-ant-...'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={status?.canStoreKey === false}
            />
            <button className="btn small" type="submit" disabled={!key.trim() || saving}>
              Save
            </button>
            {coach.ready && (
              <button
                className="btn small danger"
                type="button"
                onClick={() => {
                  void coach.clearKey()
                  setMessage({ kind: 'good', text: 'Key removed.' })
                }}
              >
                Remove
              </button>
            )}
          </form>
          {status?.canStoreKey === false && <p className="error-text">This computer offers no secure key store, so the key cannot be saved.</p>}
          {message && <p className={message.kind === 'bad' ? 'error-text' : 'muted'} style={{ marginTop: 6 }}>{message.text}</p>}
        </div>
      </div>

      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="claude-model">
            Model
          </label>
          <div className="desc">
            A typical question costs about {formatDollars(estimate('claude-opus-5-5'))} on Opus, {formatDollars(estimate('claude-sonnet-5-5'))} on Sonnet
            and {formatDollars(estimate('claude-haiku-5-5'))} on Haiku.
          </div>
          <select id="claude-model" value={status?.model ?? 'claude-opus-5-5'} onChange={(e) => void coach.setModel(e.target.value as CoachModel)}>
            {(status?.models ?? (Object.keys(PRICES) as CoachModel[])).map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="claude-cap">
            Monthly limit
          </label>
          <div className="desc">
            {coach.usage
              ? `${coach.usage.questions} question${coach.usage.questions === 1 ? '' : 's'} this month, about ${formatDollars(coach.usage.dollars)} (estimated from Anthropic's list prices).`
              : 'Nothing spent this month.'}{' '}
            The coach stops asking once the limit is reached.
          </div>
          <select
            id="claude-cap"
            value={settings.claudeMonthlyCap}
            onChange={(e) => update({ claudeMonthlyCap: Number(e.target.value) as Settings['claudeMonthlyCap'] })}
          >
            {CAPS.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? 'No limit' : `${formatDollars(c)} a month`}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  )
}

/** A typical question: about 3,000 tokens in (2,000 of them cached after the first) and 600 out. */
function estimate(model: CoachModel): number {
  const p = PRICES[model]
  return (1000 * p.input + 2000 * p.cacheRead + 600 * p.output) / 1_000_000
}
